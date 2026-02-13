# Security Design (Sudo Lock)

FlowX2 prioritizes safe and secure execution of privileged commands.

## Sudo Lock

The **Sudo Lock** system allows workflows to execute `sudo` commands without interactive password prompts during runtime.

### 1. Pre-Flight Authorization
Instead of pausing execution mid-stream (which is difficult in async pipelines), we authorize the entire workflow session upfront.
- **Frontend**: Scans the graph for nodes marked with `sudoLock: true`.
- **Modal**: If found, prompts the user for their system password via a secure modal.
- **Transmission**: The password is sent over HTTPS/WSS in the execution payload (never stored in DB).

### 2. SudoKeepAlive (Context Manager)
On the backend, a `SudoKeepAlive` class handles the session:
1.  **Validation**: Runs `sudo -v -S` with the provided password to authenticate.
2.  **Keep-Alive Loop**: Spawns a background task running `sudo -n -v` every few minutes to refresh the sudo timestamp.
3.  **Cleanup**: Automatically kills the background loop when the execution context exits.

### 3. Usage in Nodes
Command Nodes use the `sudoLock` flag to wrap their execution:

```python
# backend/nodes/command/node.py

if use_sudo_lock:
    from engine.security import SudoKeepAlive
    async with SudoKeepAlive(password):
        # Now 'sudo -n' works without password
        await run_process("sudo -n apt install ...")
```

## Risk Analysis

Every generated command is analyzed by Gemini for risk:
- **SAFE**: No side effects (e.g., `ls`, `echo`).
- **CAUTION**: Modifies system state or network (e.g., `curl`, `pip install`).
- **CRITICAL**: Requires root or destroys data (e.g., `rm -rf`, `dd`).

High-risk commands are visually flagged in the UI with Amber/Red badges.
