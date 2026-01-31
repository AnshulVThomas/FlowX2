import os
import pty
import subprocess
import struct
import fcntl
import termios
import signal
import asyncio

class PtySession:
    def __init__(self, command: str):
        self.command = command
        self.master_fd = None
        self.process = None

    def start(self):
        """Spawns the process attached to a new PTY."""
        # 1. Create the PTY pair
        self.master_fd, slave_fd = pty.openpty()

        # 2. Determine the shell (defaults to bash)
        # Note: We are executing the specific command passed, not just an empty shell
        shell = os.environ.get("SHELL", "/bin/bash")

        # 3. Spawn the process
        # We run inside the shell to inherit aliases and env vars
        self.process = subprocess.Popen(
            [shell, "-c", self.command],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            preexec_fn=os.setsid, # Create a new session ID
            close_fds=True
        )
        
        # Close the slave FD in the parent (child owns it now)
        os.close(slave_fd)
        return self.master_fd

    def write(self, data: bytes):
        """Writes user input (keystrokes) to the PTY."""
        if self.master_fd:
            os.write(self.master_fd, data)

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
