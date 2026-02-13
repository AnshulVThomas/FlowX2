from typing import Dict, Any, List
import re
from engine.protocol import FlowXNode, ValidationResult, RuntimeContext
from engine.pty_runner import execute_in_pty

class CommandNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        errors = []
        node_id = data.get("id")
        node_data = data.get("data", {})
        command = node_data.get("command", "")

        # Empty Check
        if not command or not command.strip():
            errors.append({
                "nodeId": node_id,
                "message": "Command is empty",
                "level": "CRITICAL"
            })
        
        # Placeholder Check (Regex for <...>)
        placeholder_pattern = re.compile(r"<[^>]+>")
        if command and placeholder_pattern.search(command):
            errors.append({
                "nodeId": node_id,
                "message": "Command contains unreplaced placeholders",
                "level": "CRITICAL"
            })

        # Locked Check
        if node_data.get("locked") is True:
             errors.append({
                "nodeId": node_id,
                "message": "Node is locked. Please unlock to proceed.",
                "level": "CRITICAL"
            })

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the bash command via the Hybrid PTY Runner with real-time streaming.
        """
        command = self.data.get("command", "")
        if not command:
            return {"status": "error", "stdout": "No command provided"}

        # Extract Context (Includes Vault Node password)
        runtime_ctx = ctx.get("context", {})
        emit = runtime_ctx.get("emit_event")
        sudo_password = runtime_ctx.get("sudo_password")
        node_id = self.data.get("id", "unknown")
        
        # Check Sudo Lock Status
        use_sudo_lock = self.data.get("sudoLock", False)
        password_to_inject = sudo_password if use_sudo_lock else None

        # Thread-safe logging callback
        async def stream_logger(chunk: str, stream_type: str):
            if emit and chunk.strip():
                await emit("node_log", {
                    "nodeId": node_id, 
                    "log": chunk, 
                    "type": stream_type
                })

        try:
            # Emit starting command
            if emit:
                await emit("node_log", {
                    "nodeId": node_id, 
                    "log": f"\r\n\x1b[36m> {command}\x1b[0m\r\n", 
                    "type": "stdout"
                })

            # Fire the Hybrid PTY Runner
            exit_code, stdout, stderr = await execute_in_pty(
                command=command,
                sudo_password=password_to_inject,
                on_output=stream_logger
            )

            status = "success" if exit_code == 0 else "error"
            final_output = stdout if status == "success" else (stderr or stdout)

            return {
                "status": status,
                "stdout": final_output.strip(),
                "exit_code": exit_code
            }

        except Exception as e:
            return {"status": "error", "stdout": str(e)}

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": True,
            "is_interactive": True 
        }
