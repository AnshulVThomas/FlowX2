"""
WriteFileToolNode — Native Python file-writing capability for FlowX agents.

Rationale: The ShellToolNode's sandbox deliberately blocks shell redirects (>)
and Turing-complete interpreter flags (python3 -c, node -e), which are the
only ways to create files from a shell command. Rather than weakening either
restriction, we provide a dedicated tool that uses the host Python runtime's
open() call directly — no shell, no sandbox bypass, no new attack surface.

Security model:
  - Writes are restricted to paths under WRITE_BASE_DIR (/workspace).
  - Path traversal (../../etc/passwd) is rejected before any I/O.
  - Parent directories are created automatically (mkdir -p semantics).
  - File size is capped at MAX_FILE_BYTES to prevent disk exhaustion.
  - Encoding is always UTF-8; binary writes are not supported by design.

Architecture: same capability token pattern as ShellToolNode.
  The closure is baked at design time. The agent receives a plain async
  callable and cannot inspect or modify the write root or size cap.
"""

import os
from pathlib import Path
from typing import Any, Dict

from engine.protocol import FlowXNode, ValidationResult

# ── Policy constants ──────────────────────────────────────────────────────────
HOST_WORKSPACE_DIR = Path(os.path.abspath("workspace"))
HOST_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

WRITE_BASE_DIR = HOST_WORKSPACE_DIR
MAX_FILE_BYTES = 1 * 1024 * 1024   # 1 MB — generous for source code, safe for disk


# ── Core implementation ───────────────────────────────────────────────────────

async def _write_file(path: str, content: str) -> str:
    """
    Write `content` to `path` (relative to /workspace or absolute within it).

    Returns a human-readable success or error string for the agent.
    """
    try:
        # ── Normalise the incoming path ───────────────────────────────────
        # Always anchor to WRITE_BASE_DIR.
        # If the agent passes an absolute path (e.g. '/workspace/src/foo.py'
        # or '/etc/passwd'), strip the leading slash and treat it as relative
        # to WRITE_BASE_DIR so the jail check is always applied.
        raw = Path(path)
        if raw.is_absolute():
            # Strip a leading '/workspace' prefix if present so the agent can
            # pass either form without doubling the base dir.
            try:
                rel = raw.relative_to(WRITE_BASE_DIR)
            except ValueError:
                # Absolute path that is NOT under /workspace — treat its
                # string representation as a relative path from the base.
                rel = Path(str(raw).lstrip('/'))
            target = WRITE_BASE_DIR / rel
        else:
            target = WRITE_BASE_DIR / raw

        # ── Guard: path traversal (symlink-safe) ──────────────────────────
        # Resolve BOTH the target and the base *after* construction so that
        # symlinks inside /workspace cannot escape the jail.
        try:
            resolved_base   = WRITE_BASE_DIR.resolve()
            target          = target.resolve()
        except Exception as e:
            return f"Error: Could not resolve path '{path}': {e}"

        # is_relative_to handles symlinks correctly; startswith() does not.
        if not target.is_relative_to(resolved_base):
            return (
                f"Error: Path '{path}' resolves outside the allowed write root "
                f"({resolved_base}). Writes are restricted to /workspace."
            )

        # ── Guard: content size ───────────────────────────────────────────
        encoded = content.encode("utf-8", errors="replace")
        if len(encoded) > MAX_FILE_BYTES:
            return (
                f"Error: Content size ({len(encoded):,} bytes) exceeds the "
                f"{MAX_FILE_BYTES // 1024} KB write limit. Split the file into "
                f"smaller chunks."
            )

        # ── Write ─────────────────────────────────────────────────────────
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

        # ── Ownership fix ─────────────────────────────────────────────────
        # The backend may run as root or a service user. ShellToolNode maps
        # the *current process* UID/GID into the bwrap sandbox via --uid/--gid.
        # Stamp the new file (and any newly-created parent dirs) with the same
        # UID/GID so the sandbox user can read, compile, and edit them.
        host_uid = os.getuid()
        host_gid = os.getgid()
        os.chown(target, host_uid, host_gid)
        # Walk newly-created ancestors up to (but not including) the base dir
        # and fix their ownership too, so directory traversal inside bwrap works.
        ancestor = target.parent
        while ancestor != resolved_base and ancestor != ancestor.parent:
            try:
                os.chown(ancestor, host_uid, host_gid)
            except OSError:
                break   # Already owned correctly or we don't have permission — stop
            ancestor = ancestor.parent

        return f"OK: Wrote {len(encoded):,} bytes to {target}"

    except PermissionError as e:
        return f"Error: Permission denied writing to '{path}': {e}"
    except OSError as e:
        return f"Error: OS error writing to '{path}': {e}"
    except Exception as e:
        return f"Error: Unexpected failure writing to '{path}': {e}"


# ── Tool schema ───────────────────────────────────────────────────────────────

WRITE_FILE_TOOL_DEF: Dict[str, Any] = {
    "name": "write_file",
    "description": (
        f"Write text content to a file on the host system under {WRITE_BASE_DIR}. "
        "Creates any missing parent directories automatically. "
        "Overwrites the file if it already exists. "
        "\n\nCRITICAL CONSTRAINTS:"
        f"\n- Path must be relative to or an absolute path under {WRITE_BASE_DIR}."
        f"\n- Path traversal outside {WRITE_BASE_DIR} is blocked."
        "\n- Content must be UTF-8 text. Binary files are not supported."
        "\n- Maximum content size: 1 MB per call. Split larger files."
        "\n- Writes are permanent. There is no undo."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": (
                    f"Destination file path. Relative paths are anchored to {WRITE_BASE_DIR}. "
                    f"Example: 'src/utils.py' or '{WRITE_BASE_DIR}/src/utils.py'"
                ),
            },
            "content": {
                "type": "string",
                "description": "Full UTF-8 text content to write to the file.",
            },
        },
        "required": ["path", "content"],
    },
}


# ── FlowX Node ────────────────────────────────────────────────────────────────

class WriteFileToolNode(FlowXNode):
    """
    Capability injection node. Packages a write_file closure as a TOOL_DEF
    output for ReActAgentNodeV2 to register and call.

    Complements ShellToolNode: the agent uses Shell to execute things,
    and WriteFile to create/overwrite files. Neither tool can do the
    other's job, which keeps the attack surface minimal.
    """

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        # No configuration — the tool is always usable as-is.
        return {"valid": True, "errors": []}

    async def execute(
        self,
        ctx: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "status": "success",
            "output": {
                "type":           "TOOL_DEF",
                "definition":     WRITE_FILE_TOOL_DEF,
                "implementation": _write_file,
            },
        }

    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
