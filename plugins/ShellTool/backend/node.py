import asyncio
from typing import Dict, Any
from engine.protocol import FlowXNode, ValidationResult

async def _run_shell(cmd_str: str) -> str:
    print(f"[SHELL TOOL 🔵] Executing: {cmd_str}")
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd_str,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        except asyncio.TimeoutError:
            proc.kill()
            return "Error: Command timed out after 15 seconds."

        output = stdout.decode().strip()
        error = stderr.decode().strip()
        
        if proc.returncode != 0:
            print(f"[SHELL TOOL 🔴] Failed: {error}")
            return f"Error (Exit Code {proc.returncode}): {error}"
            
        print(f"[SHELL TOOL 🟢] Result: {output[:100]}...")
        return output if output else "(No Output)"
    except Exception as e:
        return f"Error: {str(e)}"

# Define Schema locally
SHELL_TOOL_DEF = {
    "name": "run_shell",
    "description": "Execute a shell command on the host system. Use this to inspect files, run scripts, or manage services.",
    "parameters": "{\"command\": \"string\"}"
}

class ShellToolNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "status": "success",
            "output": {
                "type": "TOOL_DEF",
                "definition": SHELL_TOOL_DEF,
                "implementation": _run_shell
            }
        }
        
    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
