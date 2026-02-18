import asyncio
import pexpect
from typing import Callable, Tuple

async def execute_in_pty(
    command: str, 
    sudo_password: str = None, 
    on_output: Callable[[str, str], None] = None
) -> Tuple[int, str, str]:
    """
    Executes a command in an isolated PTY.
    Uses pure stream-reading and dynamic auto-injection to handle sudo securely.
    """
    loop = asyncio.get_running_loop()
    result = {"exit_code": 1, "stdout": "", "stderr": ""}

    def pexpect_thread_worker():
        output_buffer = []
        print(f"[PTY DEBUG] Entry: command='{command}'")
        
        try:
            # 1. Spawn the raw command natively. No wrappers.
            child = pexpect.spawn(
                '/bin/bash', ['-c', command],
                encoding='utf-8',
                timeout=None, 
                echo=False 
            )

            rolling_window = ""
            print(f"[PTY DEBUG] Entering Pure Streaming Loop.")
            
            # 2. The Line-by-Line Streaming Engine
            while True:
                try:
                    chunk = child.read_nonblocking(size=4096, timeout=0.1)
                    if not chunk:
                        if not child.isalive():
                            break
                        continue
                    
                    # 3. Dynamic Sudo Auto-Responder (ALWAYS LISTENING)
                    rolling_window += chunk
                    if len(rolling_window) > 256:
                        rolling_window = rolling_window[-256:]
                    
                    window_lower = rolling_window.lower()
                    
                    # A. Detect any standard sudo prompt
                    if "[sudo] password" in window_lower or "password for" in window_lower:
                        if sudo_password:
                            print(f"[PTY DEBUG] Auto-Answer Triggered!")
                            child.sendline(sudo_password)
                            rolling_window = "" # Clear window
                        else:
                            # THE FIX: Fail-Fast if prompt appears but no password is provided
                            print(f"[PTY DEBUG] Sudo prompt detected, but Node is Unlocked! Aborting.")
                            msg = "\n[FlowX Error] Sudo password required but Sudo Lock is OFF or Vault is empty.\n"
                            if on_output:
                                asyncio.run_coroutine_threadsafe(on_output(msg, "stderr"), loop)
                            child.close()
                            result["exit_code"] = 1
                            return
                             
                    # B. Detect an incorrect password rejection
                    elif "sorry, try again" in window_lower:
                        print(f"[PTY DEBUG] Incorrect Password Detected. Aborting.")
                        msg = "\n[FlowX Error] Incorrect sudo password.\n"
                        if on_output:
                            asyncio.run_coroutine_threadsafe(on_output(msg, "stderr"), loop)
                        child.close()
                        result["exit_code"] = 1
                        return

                    # 4. Stream to UI
                    output_buffer.append(chunk)
                    if on_output:
                        asyncio.run_coroutine_threadsafe(on_output(chunk, "stdout"), loop)
                
                except pexpect.TIMEOUT:
                    if not child.isalive():
                        print(f"[PTY DEBUG] Process finished (Timeout caught).")
                        break
                    continue
                except pexpect.EOF:
                    print(f"[PTY DEBUG] Process finished (EOF caught).")
                    break

            child.close()
            result["exit_code"] = child.exitstatus if child.exitstatus is not None else 1
            result["stdout"] = "".join(output_buffer)
            print(f"[PTY DEBUG] Exit Code: {result['exit_code']}")

        except Exception as e:
            result["exit_code"] = 1
            error_msg = str(e)
            result["stderr"] = error_msg
            if on_output:
                asyncio.run_coroutine_threadsafe(on_output(error_msg, "stderr"), loop)
            print(f"[PTY DEBUG] Exception: {e}")

    await loop.run_in_executor(None, pexpect_thread_worker)
    return result["exit_code"], result["stdout"], result["stderr"]
