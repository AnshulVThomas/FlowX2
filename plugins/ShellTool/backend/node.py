"""
ShellToolNode — Sandboxed host execution broker for FlowX agents.

Security stack (innermost → outermost):
  Layer 1  — shlex argv parse, no shell=True
  Layer 2  — bwrap filesystem namespace (ro binds, tmpfs, workspace isolation)
  Layer 3  — Capability profiles (allowlist, network flag, write paths)
  Layer 4  — Output sanitization (truncate, redact secrets, strip ANSI)
  Layer 5  — Pre-execution audit log (MongoDB, fire-and-forget)
  Layer 6  — prlimit resource quotas (RAM, procs, CPU, fsize, nofile)
  Layer 7  — Argument-level flag heuristics (Turing-complete binary traps)
  Layer 8  — Non-interactive env + stdin=DEVNULL

Architecture: capability token pattern.
  The user configures a profile at workflow design time.
  The profile is baked into a closure passed to the agent.
  The agent cannot inspect or escalate the profile.
"""

import asyncio
import re
import shlex
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from database.connection import db
from engine.protocol import FlowXNode, ValidationResult


# ══════════════════════════════════════════════════════════════════════════════
# POLICY
# ══════════════════════════════════════════════════════════════════════════════

CAPABILITY_PROFILES: Dict[str, Dict[str, Any]] = {
    "read_only": {
        "allowed": [
            "ls", "cat", "find", "grep", "df", "ps", "echo", "pwd",
            "wc", "head", "tail", "sort", "uniq", "diff", "stat",
            "file", "which", "env", "printenv", "date", "id", "whoami",
            "uname", "hostname", "uptime", "free",
        ],
        "network": False,
        "write": False,
        "write_paths": [],
        "max_output_bytes": 4096,
        "ram_bytes": 256 * 1024 * 1024,    # 256 MB
        "max_procs": 32,
        "cpu_seconds": 10,
        "wall_seconds": 15,
        "extra_ro_mounts": [],
    },

    "developer": {
        "allowed": [
            # filesystem
            "ls", "cat", "find", "grep", "stat", "file", "wc",
            "head", "tail", "sort", "uniq", "diff", "echo", "pwd",
            "cp", "mv", "rm", "mkdir", "touch", "chmod", "chown",
            # archives
            "tar", "gzip", "gunzip", "zip", "unzip", "xz",
            # network / package managers
            "curl", "git", "pip", "pip3", "python3", "python",
            "node", "npm", "npx", "yarn",
            # build
            "make", "gcc", "g++", "go", "cargo", "rustc",
            # text processing
            "awk", "sed", "jq", "cut", "tr",
            # misc
            "env", "which", "date", "id", "whoami",
        ],
        "network": True,        # pip / npm / git clone need outbound
        "write": True,
        "write_paths": ["/workspace"],
        "max_output_bytes": 16384,
        "ram_bytes": 512 * 1024 * 1024,    # 512 MB
        "max_procs": 50,
        "cpu_seconds": 30,
        "wall_seconds": 45,
        "extra_ro_mounts": [],
    },

    "ops": {
        "allowed": [
            "systemctl", "journalctl", "ps", "df", "ls", "grep",
            "cat", "tail", "head", "stat", "find", "ss", "netstat",
            "free", "uptime", "whoami", "id", "uname", "date",
            "env", "which", "lsof", "dmesg",
        ],
        "network": False,
        "write": False,
        "write_paths": [],
        "max_output_bytes": 8192,
        "ram_bytes": 128 * 1024 * 1024,    # 128 MB
        "max_procs": 32,
        "cpu_seconds": 10,
        "wall_seconds": 15,
        # ops needs log visibility and systemd socket access
        "extra_ro_mounts": [
            ("/var/log",        "/var/log"),
            ("/run/systemd",    "/run/systemd"),
            ("/etc/systemd",    "/etc/systemd"),
            ("/run/dbus",       "/run/dbus"),
        ],
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# ARGUMENT-LEVEL FLAG HEURISTICS  (Layer 7)
# Turing-complete binaries can achieve arbitrary execution through their flags.
# Block the specific escape vectors without banning the binary entirely.
# ══════════════════════════════════════════════════════════════════════════════

# Maps base_cmd → list of forbidden substrings anywhere in the argument list.
DANGEROUS_FLAGS: Dict[str, List[str]] = {
    "find":    ["-exec", "-execdir", "-delete", "-ok", "-okdir"],
    "awk":     ["system(", "getline", "|"],
    "sed":     ["e\\",  "-e exec"],         # sed 'e' flag executes shell
    "python3": ["-c", "os.system", "subprocess", "exec(", "eval(", "__import__"],
    "python":  ["-c", "os.system", "subprocess", "exec(", "eval(", "__import__"],
    "node":    ["-e", "--eval", "child_process", "require('fs').unlink"],
    "git":     ["--upload-pack", "--receive-pack", "daemon"],
    "curl":    ["-o /usr", "--output /usr", "-o /bin", "--config /etc"],
    "chmod":   ["-R /", "777 /", "777 /usr", "777 /bin", "777 /etc"],
    "rm":      ["--no-preserve-root", "-rf /", "-rf /*", "-r /bin",
                "-r /usr", "-r /lib", "-r /etc", "-r /root"],
    "tar":     ["--to-command", "-I", "--use-compress-program"],  # arbitrary exec via decompressor
}

# Binaries that require a TTY / stdin and will hang forever without one.
# Block them outright rather than let them timeout.
INTERACTIVE_BINARIES = {
    "nano", "vim", "vi", "emacs", "pico", "less", "more",
    "top", "htop", "btop", "mysql", "psql", "sqlite3",
    "python3 -i", "node --interactive", "irb", "iex",
    "ftp", "sftp", "telnet",
}

# Non-interactive execution environment (Layer 8)
SAFE_ENV: Dict[str, str] = {
    "PATH":                 "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin",
    "HOME":                 "/workspace",
    "TMPDIR":               "/tmp",
    "DEBIAN_FRONTEND":      "noninteractive",
    "GIT_TERMINAL_PROMPT":  "0",
    "GIT_SSH_COMMAND":      "ssh -o BatchMode=yes -o StrictHostKeyChecking=no",
    "NPM_CONFIG_YES":       "true",
    "PIP_NO_INPUT":         "1",
    "PIP_DISABLE_PIP_VERSION_CHECK": "1",
    "PYTHONDONTWRITEBYTECODE": "1",
    "PYTHONUNBUFFERED":     "1",
    "CI":                   "true",     # suppresses many interactive prompts
}

# Output redaction patterns (Layer 4)
SENSITIVE_PATTERNS: List[str] = [
    r"[A-Za-z0-9+/]{60,}={0,2}",           # base64 blobs / long tokens (≥60 avoids git SHAs)
    r"-----BEGIN [A-Z ]+-----",             # PEM private keys
    r"(?i)password\s*[=:]\s*\S+",          # inline passwords
    r"(?i)(?:api[_-]?key|token|secret)\s*[=:]\s*\S+",
    r"(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*", # Authorization headers
    r"IGNORE PREVIOUS INSTRUCTIONS",        # prompt injection attempt
    r"(?i)ignore all previous",
    r"<\|.*?\|>",                           # model control tokens
    r"\x1b\[[0-9;]*[mGKHJABCDFfnsu]",     # ANSI escape sequences
]


# ══════════════════════════════════════════════════════════════════════════════
# BROKER INTERNALS
# ══════════════════════════════════════════════════════════════════════════════

def _build_bwrap_prefix(profile: Dict[str, Any]) -> List[str]:
    """
    Layer 6 + Layer 2: prlimit(resource quotas) wrapping bwrap(namespace).

    Uses explicit --unshare-* flags instead of --unshare-all.
    --unshare-all includes --unshare-uts which breaks git (reads /etc/hostname)
    and --unshare-ipc which breaks some Python multiprocessing.
    """
    cmd: List[str] = [
        # ── Layer 6: resource quotas ─────────────────────────────────────
        "prlimit",
        f"--as={profile['ram_bytes']}",         # max virtual address space
        f"--nproc={profile['max_procs']}",       # stops fork bombs
        f"--cpu={profile['cpu_seconds']}",       # pure CPU time (SIGKILL on exceed)
        "--nofile=128",                          # max open file descriptors
        "--fsize=52428800",                      # max single file write: 50 MB

        # ── Layer 2: bwrap namespace ──────────────────────────────────────
        "bwrap",

        # read-only system binaries
        "--ro-bind", "/usr",  "/usr",
        "--ro-bind", "/lib",  "/lib",
        "--ro-bind", "/bin",  "/bin",
        "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
        "--ro-bind", "/etc/ssl",         "/etc/ssl",
        "--ro-bind", "/etc/ca-certificates.crt", "/etc/ca-certificates.crt",

        # virtual filesystems
        "--tmpfs",   "/tmp",
        "--tmpfs",   "/home",
        "--proc",    "/proc",
        "--dev",     "/dev",

        # explicit isolation (NOT --unshare-all — see docstring)
        "--unshare-pid",
        "--unshare-user",
        "--unshare-ipc",
        "--die-with-parent",    # orphan prevention
        "--new-session",        # detach from controlling TTY / process group
    ]

    # lib64 is optional — not present on all distros
    cmd += ["--ro-bind-try", "/lib64", "/lib64"]

    # network isolation is profile-controlled
    if not profile.get("network"):
        cmd += ["--unshare-net"]

    # profile-specific extra read-only mounts (e.g. /var/log for ops)
    for host_path, container_path in profile.get("extra_ro_mounts", []):
        cmd += ["--ro-bind-try", host_path, container_path]

    # workspace: read-write for write-enabled profiles, read-only otherwise
    if profile.get("write"):
        for path in profile.get("write_paths", ["/workspace"]):
            cmd += ["--bind", path, path]
    else:
        cmd += ["--ro-bind-try", "/workspace", "/workspace"]

    cmd += ["--chdir", "/workspace", "--"]
    return cmd


def _validate_command(
    command: str,
    profile: Dict[str, Any],
) -> Tuple[Optional[List[str]], Optional[str]]:
    """
    Layer 1 + Layer 7: Parse and validate command before execution.

    Returns (argv, None) on success or (None, error_string) on rejection.
    """
    # Parse to argv — rejects shell metacharacters entirely
    try:
        argv = shlex.split(command)
    except ValueError as e:
        return None, f"Error: Malformed command: {e}"

    if not argv:
        return None, "Error: Empty command."

    # Strip any path prefix to get the base binary name
    # Prevents path traversal like ../../bin/sh
    base_cmd = argv[0].split("/")[-1]

    # Block interactive binaries that will hang on stdin=DEVNULL
    if base_cmd in INTERACTIVE_BINARIES:
        return None, (
            f"Error: '{base_cmd}' is an interactive binary. "
            f"It requires a TTY and cannot run in this environment."
        )

    # Allowlist check
    if base_cmd not in profile["allowed"]:
        return None, (
            f"Error: '{base_cmd}' is not permitted in the "
            f"'{profile.get('name', 'current')}' profile. "
            f"Allowed: {sorted(profile['allowed'])}"
        )

    # Argument-level heuristics for Turing-complete binaries
    if base_cmd in DANGEROUS_FLAGS:
        full_arg_str = " ".join(argv[1:])
        for forbidden in DANGEROUS_FLAGS[base_cmd]:
            if forbidden in full_arg_str:
                return None, (
                    f"Error: Argument pattern '{forbidden}' is forbidden "
                    f"for '{base_cmd}' (arbitrary execution vector)."
                )

    return argv, None


def _sanitize_output(text: str, max_bytes: int) -> str:
    """
    Layer 4: Truncate and redact sensitive content before it enters LLM context.
    Called AFTER execution so it never influences the command itself.
    """
    # Truncate first — avoids running regexes on huge strings
    if len(text) > max_bytes:
        text = text[:max_bytes] + f"\n[TRUNCATED: output exceeded {max_bytes} bytes]"

    for pattern in SENSITIVE_PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text, flags=re.IGNORECASE)

    return text


async def _write_audit(record: Dict[str, Any]) -> None:
    """Layer 5: Fire-and-forget audit write. Never blocks execution."""
    try:
        await db.get_db().shell_audit.insert_one(record)
    except Exception as e:
        print(f"[BROKER ⚠️] Audit write failed (non-fatal): {e}")


async def _run_with_profile(
    command: str,
    profile: Dict[str, Any],
    run_id: str,
) -> str:
    """
    Central broker. Applies all 8 security layers in order.
    This function is the only path to host execution — never call
    asyncio.create_subprocess_* directly from agent code.
    """

    # ── Layers 1 + 7: validate before touching the OS ─────────────────────────
    argv, error = _validate_command(command, profile)
    if error:
        return error

    # ── Layer 5: audit record BEFORE execution ────────────────────────────────
    # Write intent before we fork. If the process kills the backend mid-run,
    # we still have a pending record we can investigate.
    audit_record = {
        "run_id":    run_id,
        "command":   command,
        "argv":      argv,
        "profile":   profile.get("name", "unknown"),
        "timestamp": datetime.utcnow(),
        "status":    "pending",
    }
    asyncio.create_task(_write_audit(audit_record))

    # ── Layers 2 + 6: build sandboxed command ─────────────────────────────────
    full_cmd = _build_bwrap_prefix(profile) + argv

    print(f"[BROKER 🔵] run_id={run_id} profile={profile.get('name')} cmd={command!r}")

    status = "completed"
    output = ""

    try:
        proc = await asyncio.create_subprocess_exec(
            *full_cmd,
            stdin=asyncio.subprocess.DEVNULL,   # Layer 8: no TTY, interactive cmds crash fast
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=SAFE_ENV,                        # Layer 8: stripped, non-interactive environment
        )

        wall_timeout = profile.get("wall_seconds", profile["cpu_seconds"] + 5)

        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(),
                timeout=wall_timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            status = "timeout"
            output = (
                f"Error: Command exceeded wall-clock timeout of {wall_timeout}s. "
                f"CPU limit is {profile['cpu_seconds']}s. "
                f"Consider splitting into smaller operations."
            )
        else:
            stdout_str = stdout_b.decode(errors="replace").strip()
            stderr_str = stderr_b.decode(errors="replace").strip()

            if proc.returncode != 0:
                status = "failed"
                # Return stderr preferentially — it has the useful error message.
                # Fall back to stdout if stderr is empty (some tools do this).
                raw = stderr_str or stdout_str
                output = f"Error (exit {proc.returncode}): {raw}"
                print(f"[BROKER 🔴] exit={proc.returncode} stderr={stderr_str[:120]!r}")
            else:
                status = "completed"
                output = stdout_str if stdout_str else "(No output)"
                print(f"[BROKER 🟢] exit=0 output_len={len(stdout_str)}")

    except FileNotFoundError as e:
        status = "broker_error"
        output = (
            f"Error: Broker dependency not found: {e}. "
            f"Ensure 'bwrap' (bubblewrap) and 'prlimit' are installed on the host."
        )
        print(f"[BROKER 💀] Missing dependency: {e}")

    except PermissionError as e:
        status = "broker_error"
        output = f"Error: Permission denied launching sandbox: {e}"
        print(f"[BROKER 💀] Permission error: {e}")

    except Exception as e:
        status = "broker_error"
        output = f"Error: Unexpected broker failure: {e}"
        print(f"[BROKER 💀] Unhandled: {e}")

    # ── Update audit record with outcome ──────────────────────────────────────
    asyncio.create_task(_write_audit({
        **audit_record,
        "status":       status,
        "output_bytes": len(output),
        "completed_at": datetime.utcnow(),
    }))

    # ── Layer 4: sanitize AFTER execution, before returning to LLM ───────────
    return _sanitize_output(output, profile["max_output_bytes"])


# ══════════════════════════════════════════════════════════════════════════════
# TOOL SCHEMA
# Standard JSON Schema format required by Gemini function calling API.
# ══════════════════════════════════════════════════════════════════════════════

def _build_tool_schema(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Build the tool definition injected into the LLM system prompt."""
    profile_name = profile.get("name", "unknown")
    network_str  = "enabled" if profile.get("network") else "disabled"
    allowed_str  = ", ".join(sorted(profile["allowed"]))

    return {
        "name": "run_shell",
        "description": (
            f"Execute a single shell command on the host system. "
            f"Profile: {profile_name}. "
            f"Network: {network_str}. "
            f"Allowed binaries: {allowed_str}. "
            f"\n\nCRITICAL CONSTRAINTS:"
            f"\n- Shell pipelines (|), redirects (> >>), and chaining (&& || ;) are NOT supported."
            f"\n- Run one command at a time. Chain logic across ReAct steps, not within one command."
            f"\n- Environment is stateless. Each command starts fresh in /workspace."
            f"\n- Do NOT use 'cd' or 'export'. Use absolute paths (e.g. 'ls /workspace/src')."
            f"\n- To filter output: save to a file first, then run grep/awk on the file in the next step."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": (
                        "A single, complete, non-interactive shell command. "
                        "Example: 'ls -la /workspace/src' or 'grep -r TODO /workspace --include=*.py'"
                    ),
                }
            },
            "required": ["command"],
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# FLOWX NODE
# ══════════════════════════════════════════════════════════════════════════════

class ShellToolNode(FlowXNode):
    """
    Capability injection node. Does not execute anything itself.
    Packages a sandboxed execution closure + schema into a TOOL_DEF output
    that the ReActAgentNodeV2 input loop picks up and registers as a callable tool.

    The profile is baked into the closure at workflow design time.
    The agent cannot inspect or escalate the profile.
    """

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        profile_name = data.get("data", {}).get("capability_profile", "read_only")
        if profile_name not in CAPABILITY_PROFILES:
            return {
                "valid": False,
                "errors": [{
                    "message": (
                        f"Unknown capability profile: '{profile_name}'. "
                        f"Valid options: {list(CAPABILITY_PROFILES.keys())}"
                    )
                }],
            }
        return {"valid": True, "errors": []}

    async def execute(
        self,
        ctx: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        profile_name = self.data.get("capability_profile", "read_only")
        profile      = {**CAPABILITY_PROFILES[profile_name], "name": profile_name}
        run_id       = ctx.get("context", {}).get("run_id", "unknown")

        # Bake profile and run_id into the closure.
        # The agent receives a plain async callable — it has no access to the
        # profile dict, the run_id, or the broker internals.
        async def _sandboxed_run(command: str) -> str:
            return await _run_with_profile(command, profile, run_id)

        return {
            "status": "success",
            "output": {
                "type":           "TOOL_DEF",
                "definition":     _build_tool_schema(profile),
                "implementation": _sandboxed_run,
            },
        }

    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
