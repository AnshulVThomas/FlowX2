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
        Executes the bash command with Real-Time Streaming and Sudo Lock Support.
        """
        command = self.data.get("command", "")
        if not command:
            return {"status": "error", "stdout": "No command provided"}

        # 1. CONTEXT EXTRACTION
        # ctx structure: {'context': {'emit_event': ..., 'sudo_password': ...}, 'state': ...}
        runtime_ctx = ctx.get("context", {})
        emit = runtime_ctx.get("emit_event")
        sudo_password = runtime_ctx.get("sudo_password") # Global password
        
        node_id = self.data.get("id", "unknown")
        node_data = self.data.get("data", {})
        use_sudo_lock = node_data.get("sudoLock", False)

        # 2. SUDO PREPARATION
        final_cmd = command
        
        # Helper to execute the actual process
        async def run_process(cmd_to_run):
            # Emit command log
            if emit:
                await emit("node_log", {
                    "nodeId": node_id,
                    "log": f"\r\n\x1b[36m> {cmd_to_run}\x1b[0m\r\n", 
                    "type": "stdout"
                })

            process = await asyncio.create_subprocess_shell(
                cmd_to_run,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Streaming
            output_buffer = []
            error_buffer = []

            async def stream_pipe(stream, type_label):
                while True:
                    line = await stream.readline()
                    if not line: break
                    text = line.decode(errors='replace')
                    
                    # DEBUG LOG
                    print(f"[BACKEND] Captured {type_label}: {text.strip()}")
                    
                    if type_label == "stdout": output_buffer.append(text)
                    else: error_buffer.append(text)
                    
                    if emit:
                        print(f"[BACKEND] Emitting log for {node_id}")
                        await emit("node_log", {"nodeId": node_id, "log": text, "type": type_label})
                    else:
                        print(f"[BACKEND] CRITICAL: Emit function is missing for {node_id}")

            await asyncio.gather(
                stream_pipe(process.stdout, "stdout"), 
                stream_pipe(process.stderr, "stderr")
            )
            
            exit_code = await process.wait()
            print(f"[BACKEND] Process finished with code {exit_code}")
            return exit_code, "".join(output_buffer).strip(), "".join(error_buffer).strip()

        try:
            # 3. EXECUTION WITH OPTIONAL LOCK
            if use_sudo_lock:
                if not sudo_password:
                    return {"status": "error", "stdout": "Sudo Lock enabled but no password provided in context."}
                
                from engine.security import SudoKeepAlive
                
                # Wrap execution in KeepAlive
                # NOTE: We run 'sudo -n' in the command so it uses the cached credential from KeepAlive
                # If command already has 'sudo', perfect. If not, and lock is on, user mostly intends to run sudo.
                # But we don't force 'sudo' prefix if it's not there. We just ensure the token is alive.
                
                async with SudoKeepAlive(sudo_password):
                    # We might want to clear any existing timestamp first to be safe? 
                    # SudoKeepAlive does 'sudo -v' on enter.
                    exit_code, output, error = await run_process(final_cmd)
            else:
                # Standard Execution
                # If command has 'sudo' but no lock, it might fail interactively or use existing token.
                # Best practice: commands requiring sudo should use sudoLock.
                exit_code, output, error = await run_process(final_cmd)

            status = "success" if exit_code == 0 else "error"
            
            return {
                "status": status,
                "stdout": output if status == "success" else error,
                "exit_code": exit_code
            }

        except Exception as e:
            return {"status": "error", "stdout": str(e)}

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": True,
            "is_interactive": True 
        }
