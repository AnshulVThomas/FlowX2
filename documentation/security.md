# Security Design (Sudo Lock + PTY Isolation)

FlowX2 prioritizes safe and secure execution of privileged commands.

## Sudo Lock

The **Sudo Lock** system allows workflows to execute `sudo` commands without interactive password prompts during runtime.

### 1. Pre-Flight Authorization
Instead of pausing execution mid-stream (which is difficult in async pipelines), we authorize the entire workflow session upfront.
- **Frontend**: Scans the graph for nodes marked with `sudoLock: true`.
- **Modal**: If found, prompts the user for their system password via a secure modal.
- **Transmission**: The password is sent over HTTPS/WSS in the execution payload (never stored in DB).

### 2. True PTY Isolation (Hybrid Runner)
On the backend, each node gets its own **isolated Pseudo-Terminal** via `pexpect`, completely eliminating sudo caching race conditions between parallel nodes.

**Architecture**: `engine/pty_runner.py` → `execute_in_pty()`

The Hybrid PTY Runner uses a two-phase approach:

1.  **Authentication Phase**: A bash wrapper script runs `sudo -S -k -p "FLOWX_SUDO_PROMPT:" -v` and the PTY runner injects the password via `pexpect.sendline()`. Wrong passwords are detected instantly via the `Sorry, try again.` pattern.
2.  **Background Refresher**: After authentication, a background loop (`sudo -n -v` every 50s) keeps the credential alive for long-running commands.
3.  **Guaranteed Cleanup**: The bash `trap EXIT` command ensures the refresher process is killed even on crash, segfault, or abort.
4.  **High-Speed Streaming**: After authentication completes, the runner switches to fast `readline()` streaming (no regex overhead) and pipes output to the WebSocket via `asyncio.run_coroutine_threadsafe`.

### 3. Usage in Nodes
Command Nodes use the `sudoLock` flag to trigger PTY isolation:

```python
# plugins/CommandNode/backend/node.py

from engine.pty_runner import execute_in_pty

exit_code, stdout, stderr = await execute_in_pty(
    command="sudo apt install ...",
    sudo_password=password_from_vault,
    on_output=stream_logger
)
```

### 4. Concurrency Safety
Because each node spawns its own PTY with its own sudo session, parallel nodes **never interfere** with each other's authentication tickets. Node A and Node B can both run `sudo` commands simultaneously without race conditions.

## Risk Analysis

Every generated command is analyzed by Gemini for risk:
- **SAFE**: No side effects (e.g., `ls`, `echo`).
- **CAUTION**: Modifies system state or network (e.g., `curl`, `pip install`).
- **CRITICAL**: Requires root or destroys data (e.g., `rm -rf`, `dd`).

High-risk commands are visually flagged in the UI with Amber/Red badges.
