from typing import Dict, Any, List
import re
import asyncio
from ..protocol import FlowXNode, ValidationResult, RuntimeContext

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
        Executes the bash command.
        
        TIER 3 IMPLEMENTATION:
        1. Checks for 'sudo_password' in ctx (Rehydration).
        2. Pipes password if present.
        3. Interrupts if sudo is detected but no password provided.
        """
        command = self.data.get("command", "")
        if not command:
            return {"status": "error", "stdout": "No command provided"}

        # 1. REHYDRATION CHECK
        sudo_pass = ctx.get("sudo_password")
        
        # 2. PREPARE COMMAND (Inject Password if needed)
        # Logic: If we have a password, we prepend the echo pipe.
        final_cmd = command
        if sudo_pass:
            # Check if command actually uses sudo, otherwise this writes password to stdout!
            if "sudo" in command:
                final_cmd = f"echo '{sudo_pass}' | sudo -S {command}"
        
        # 3. EXECUTE
        print(f"[CommandNode] Executing: {final_cmd}")
        
        try:
            # Run subprocess safely
            process = await asyncio.create_subprocess_shell(
                final_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            
            output = stdout.decode().strip()
            error = stderr.decode().strip()
            exit_code = process.returncode

            # 4. INTERRUPT DETECTION (Permission Denied)
            needs_sudo = (
                "permission denied" in error.lower() or 
                "sudo: a password is required" in error.lower() or
                exit_code == 126
            )

            if needs_sudo and not sudo_pass:
                # DYNAMIC INTERRUPT
                from langgraph.errors import NodeInterrupt
                raise NodeInterrupt(f"Sudo Password Required for: {command}")

            status = "success" if exit_code == 0 else "error"
            
            return {
                "status": status,
                "stdout": output if status == "success" else error,
                "exit_code": exit_code
            }

        except Exception as e:
            if type(e).__name__ == "NodeInterrupt":
                raise e
            return {"status": "error", "stdout": str(e)}

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": True,
            "is_interactive": True 
        }
