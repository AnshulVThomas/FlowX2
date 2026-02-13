import asyncio
import subprocess
import signal
import sys
import atexit
from typing import Optional

class SudoKeepAlive:
    """
    Context manager that keeps sudo privileges alive for the duration of the block.
    It starts a background process that runs `sudo -n -v` periodically.
    It ensures the background process is killed when the block exits or the main process dies.
    """
    def __init__(self, password: str, interval: int = 60):
        self.password = password
        self.interval = interval
        self.keep_alive_task: Optional[asyncio.Task] = None
        self.stop_event = asyncio.Event()

    async def __aenter__(self):
        # 1. Validate Password & Prime Sudo
        # We use strict check. If this fails, we don't start the loop.
        cmd = f"echo '{self.password}' | sudo -S -v"
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await proc.communicate()
        
        if proc.returncode != 0:
            error_msg = stderr.decode().strip()
            raise PermissionError(f"Sudo validation failed: {error_msg}")

        # 2. Start Background Loop
        self.stop_event.clear()
        self.keep_alive_task = asyncio.create_task(self._keep_alive_loop())
        
        # Register cleanup just in case (though aexit handles it mostly)
        # Weak reference to self methods in atexit is tricky, but we can rely on asyncio loop cleanup implies task cancellation
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Stop the loop
        self.stop_event.set()
        if self.keep_alive_task:
            self.keep_alive_task.cancel()
            try:
                await self.keep_alive_task
            except asyncio.CancelledError:
                pass
        
        # Kill the token to be safe? 
        # "sudo -k" invalidates the cache.
        # Check requirements: "Exit: ... (optionally) kills the sudo token."
        # If we kill it, subsequent nodes relying on cached sudo might fail if they don't have their own lock.
        # BUT: SudoLock implies this node owns the lock.
        # If we have parallel SudoCommandNodes, they might race on "sudo -k".
        # Better strategy: Let the loop die. The system sudo timeout (usually 15m) will handle the rest.
        # Or if we want strict security, we execute "sudo -k" ONLY IF no other SudoKeepAlive is active (ref counting).
        # For now, simplest implementation: Just stop refreshing.
        pass

    async def _keep_alive_loop(self):
        try:
            while not self.stop_event.is_set():
                # Run refresh
                # sudo -n -v updates the timestamp without prompting.
                proc = await asyncio.create_subprocess_shell(
                    "sudo -n -v",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await proc.wait()
                
                # Check if we lost privilege (rare, but possible if admin revoked)
                if proc.returncode != 0:
                    print("WARNING: [SudoKeepAlive] Lost sudo privileges during refresh.")
                    # We could break or raise, but raising in background task is tricky.
                    # We just stop refreshing. 
                    break

                # Sleep
                # Use wait_for to be interruptible
                try:
                    await asyncio.wait_for(self.stop_event.wait(), timeout=self.interval)
                except asyncio.TimeoutError:
                    continue # Timeout means execute loop again
        except asyncio.CancelledError:
            pass
