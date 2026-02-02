from typing import Dict, Any, List
import re
import asyncio
from engine.protocol import FlowXNode, ValidationResult, RuntimeContext

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
        Executes the bash command with Real-Time Streaming (Tier 4).
        """
        command = self.data.get("command", "")
        if not command:
            return {"status": "error", "stdout": "No command provided"}

        # 1. CONTEXT & EMITTER
        # 'ctx' is the LangGraph state. We expect 'context' key for system injections.
        runtime_ctx = ctx.get("context", {})
        emit = runtime_ctx.get("emit_event")
        node_id = self.data.get("id", "unknown")

        # 2. REHYDRATION CHECK (Tier 3)
        sudo_pass = ctx.get("sudo_password")
        
        # 3. PREPARE COMMAND
        final_cmd = command
        if "sudo" in command:
            if sudo_pass:
                # Case A: We have a password. Automate the input.
                # -S: Read from stdin
                # -p '': Suppress the "Password:" prompt text so it doesn't leak into logs
                final_cmd = f"echo '{sudo_pass}' | sudo -S -p '' {command}"
            else:
                # Case B: No password yet. STOP IT FROM ASKING.
                # -n: Non-interactive mode. 
                # If a password is required, sudo will exit IMMEDIATELY with status 1
                # instead of hanging the server waiting for input.
                final_cmd = command.replace("sudo", "sudo -n")
        
        print(f"[CommandNode] Execution Started: {node_id}")
        print(f"[CommandNode] CMD: {final_cmd}")
        
        # Emit the command to the terminal so the user sees it
        if emit:
            print(f"[CommandNode] Emitting initial command to stream...")
            await emit("node_log", {
                "nodeId": node_id,
                "log": f"\r\n\x1b[36m> {command}\x1b[0m\r\n", # Cyan color for command
                "type": "stdout"
            })

        try:
            print("[CommandNode] Spawning subprocess...")
            process = await asyncio.create_subprocess_shell(
                final_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            print(f"[CommandNode] PID: {process.pid}")

            # 4. STREAMING PIPES
            output_buffer = []
            error_buffer = []

            async def stream_pipe(stream, type_label):
                while True:
                    line = await stream.readline()
                    if not line: 
                        break
                    text = line.decode(errors='replace')
                    
                    # Debug print to backend console
                    print(f"[CommandNode] {type_label}: {text.strip()}")

                    # Accumulate for final result
                    if type_label == "stdout":
                        output_buffer.append(text)
                    else:
                        error_buffer.append(text)
                    
                    # Emit Real-Time Log
                    if emit:
                        await emit("node_log", {
                            "nodeId": node_id,
                            "log": text,
                            "type": type_label
                        })

            # Run concurrently
            print("[CommandNode] Waiting for pipes...")
            await asyncio.gather(
                stream_pipe(process.stdout, "stdout"), 
                stream_pipe(process.stderr, "stderr")
            )
            
            exit_code = await process.wait()
            
            output = "".join(output_buffer).strip()
            error = "".join(error_buffer).strip()

            # 5. INTERRUPT DETECTION
            needs_sudo = (
                "permission denied" in error.lower() or 
                "sudo: a password is required" in error.lower() or
                exit_code == 126
            )

            if needs_sudo and not sudo_pass:
                from langgraph.errors import NodeInterrupt
                # If we emit the error before checking sudo, the UI might see 'failure'
                # But here we raise Interrupt.
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
