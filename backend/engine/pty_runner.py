import asyncio
import pexpect
import shlex
from typing import Callable, Tuple

async def execute_in_pty(
    command: str, 
    sudo_password: str = None, 
    on_output: Callable[[str, str], None] = None
) -> Tuple[int, str, str]:
    """
    Executes a command in an isolated PTY with an embedded, self-terminating sudo refresher.
    """
    loop = asyncio.get_running_loop()
    result = {"exit_code": 1, "stdout": "", "stderr": ""}

    def pexpect_thread_worker():
        output_buffer = []
        try:
            if sudo_password:
                # Escape the user's command so it safely evaluates inside the wrapper
                safe_cmd = shlex.quote(command)
                
                # THE ROBUST HYBRID WRAPPER
                # 1. Authenticate with custom prompt
                # 2. Start background refresher
                # 3. Use 'trap' to GUARANTEE refresher is killed on exit/crash
                # 4. Evaluate the user command and return its specific exit code
                wrapper_script = f"""
                sudo -S -k -p "FLOWX_SUDO_PROMPT:" -v
                
                (while true; do sudo -n -v 2>/dev/null; sleep 50; done) &
                REFRESHER_PID=$!
                
                trap "kill $REFRESHER_PID 2>/dev/null" EXIT
                
                eval {safe_cmd}
                CMD_EXIT=$?
                
                exit $CMD_EXIT
                """
            else:
                wrapper_script = command

            # Spawn the PTY
            child = pexpect.spawn(
                '/bin/bash', ['-c', wrapper_script],
                encoding='utf-8',
                timeout=None, 
                echo=False 
            )

            # --- PHASE 1: AUTHENTICATION (Only if sudo Lock is ON) ---
            if sudo_password:
                # Look for our custom prompt
                index = child.expect([
                    r'FLOWX_SUDO_PROMPT:', 
                    pexpect.EOF
                ], timeout=5)

                if index == 0:
                    child.sendline(sudo_password)
                    
                    # Quickly check if the password was rejected
                    idx_wrong = child.expect([
                        r'Sorry, try again\.', 
                        pexpect.TIMEOUT, # Timeout means it succeeded and is moving on
                        pexpect.EOF      # EOF means command finished before timeout
                    ], timeout=1)
                    
                    # Capture any output that occurred during auth check (even on timeout/EOF)
                    chunk = child.before if child.before else ""
                    if chunk:
                        # Clean up prompt artifacts if present (though unlikely here)
                        output_buffer.append(chunk)
                        if on_output:
                             asyncio.run_coroutine_threadsafe(on_output(chunk, "stdout"), loop)

                    if idx_wrong == 0:
                        msg = "\n[FlowX Error] Incorrect sudo password.\n"
                        # We might have captured partial output above, append error msg
                        if on_output:
                            asyncio.run_coroutine_threadsafe(on_output(msg, "stderr"), loop)
                        child.close()
                        result["exit_code"] = 1
                        return

            # --- PHASE 2: HIGH-SPEED STREAMING ---
            # We use read_nonblocking to capture partial output (like prompts) without hanging.
            while True:
                try:
                    chunk = child.read_nonblocking(size=4096, timeout=0.1)
                    if not chunk:
                        if not child.isalive():
                            break
                        continue

                    # Filter out the custom prompt if it leaked into the buffer
                    if "FLOWX_SUDO_PROMPT:" in chunk:
                        continue
                        
                    output_buffer.append(chunk)
                    if on_output:
                        asyncio.run_coroutine_threadsafe(on_output(chunk, "stdout"), loop)
                
                except pexpect.TIMEOUT:
                    if not child.isalive():
                        break
                    continue
                except pexpect.EOF:
                    break

            # Let the bash session close cleanly (which triggers the trap!)
            child.close()
            
            result["exit_code"] = child.exitstatus if child.exitstatus is not None else 1
            result["stdout"] = "".join(output_buffer)

        except Exception as e:
            result["exit_code"] = 1
            error_msg = str(e)
            result["stderr"] = error_msg
            if on_output:
                asyncio.run_coroutine_threadsafe(on_output(error_msg, "stderr"), loop)

    # Execute blocking worker in thread pool
    await loop.run_in_executor(None, pexpect_thread_worker)
    
    return result["exit_code"], result["stdout"], result["stderr"]
