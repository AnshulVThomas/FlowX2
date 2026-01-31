import os
import pty
import subprocess
import struct
import fcntl
import termios
import signal

class PtySession:
    def __init__(self, command: str):
        self.command = command
        self.master_fd = None
        self.process = None

    def start(self):
        """Spawns the process attached to a new PTY with proper Job Control."""
        # 1. Create the PTY pair
        self.master_fd, slave_fd = pty.openpty()

        # 2. Determine the shell (defaults to bash)
        shell = os.environ.get("SHELL", "/bin/bash")

        # --- THE FIX: Helper to set Controlling Terminal (CTTY) ---
        def set_ctty():
            # A. Create a new session (detach from parent terminal)
            os.setsid() 
            
            # B. Explicitly set this PTY as the controlling terminal for the child
            #    '0' refers to stdin, which is now the slave PTY
            #    This satisfies bash's need for a "real" terminal
            try:
                fcntl.ioctl(0, termios.TIOCSCTTY, 0)
            except Exception:
                pass

        # 3. Spawn the process
        # 3. Spawn the process with Shell Hook for state tracking
        # We use PROMPT_COMMAND to print a hidden OSC code with the exit status ($?)
        # after every command. Use /bin/bash directly to ensure hook works.
        env = os.environ.copy()
        env["PROMPT_COMMAND"] = r'printf "\033]1337;DONE:%s\007" "$?"'

        self.process = subprocess.Popen(
            ["/bin/bash"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            preexec_fn=set_ctty, 
            env=env,
            close_fds=True
        )
        
        # Close the slave FD in the parent (child owns it now)
        os.close(slave_fd)
        return self.master_fd

    def write(self, data: bytes):
        """Writes user input (keystrokes) to the PTY."""
        if self.master_fd:
            try:
                os.write(self.master_fd, data)
            except OSError:
                pass

    def read(self, size=1024) -> bytes:
        """Reads output from the PTY."""
        if self.master_fd:
            try:
                return os.read(self.master_fd, size)
            except OSError:
                return b""
        return b""

    def resize(self, rows: int, cols: int):
        """Syncs the PTY size with the frontend xterm.js size."""
        if self.master_fd:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    def terminate(self):
        """Kills the process group and closes the PTY."""
        if self.process:
            try:
                # Kill the whole process group (handles sudo children)
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
            except (ProcessLookupError, AttributeError):
                pass
        if self.master_fd:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
        self.master_fd = None
        self.process = None