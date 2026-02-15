import subprocess
import os

# --- 1. IMPLEMENTATIONS (Hidden from Agent until granted) ---
def _run_shell(args: str) -> str:
    try:
        # Security: Timeout is crucial here to prevent hanging processes
        result = subprocess.run(args, shell=True, capture_output=True, text=True, timeout=15)
        return result.stdout.strip() if result.returncode == 0 else f"Error: {result.stderr}"
    except Exception as e:
        return f"System Error: {e}"

def _read_file(args: str) -> str:
    if not os.path.exists(args): return "File not found."
    with open(args, 'r') as f: return f.read(2000) # 2KB limit

# --- 2. GLOBAL REGISTRY ---
# The Agent Node uses this to look up the function code
TOOL_IMPLEMENTATIONS = {
    "run_shell": _run_shell,
    "read_file": _read_file
}

# --- 3. SCHEMAS (Used by Tool Nodes to describe themselves) ---
TOOL_SCHEMAS = {
    "run_shell": {
        "name": "run_shell",
        "description": "Executes Linux shell commands.",
        "parameters": "command string (e.g., 'ls -la')"
    },
    "read_file": {
        "name": "read_file",
        "description": "Reads file content from the filesystem.",
        "parameters": "file path string"
    }
}
