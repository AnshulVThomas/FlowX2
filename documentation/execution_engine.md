# Async Graph Executor (v4.0)

## Overview
The `AsyncGraphExecutor` is a high-performance, strictly typed execution engine designed to replace the heavier `LangGraph` implementation. It leverages Python's `asyncio` to execute independent nodes in parallel while respecting dependency constraints.

## Key Features

### 1. Parallel Execution
Unlike sequential runners, `AsyncGraphExecutor` schedules all nodes as `asyncio.Future` objects at the start.
- Nodes with no dependencies execute immediately.
- Nodes with dependencies wait (`await`) for their parents' futures to complete.
- This allows unrelated branches of the DAG to progress at their own max speed.

### 2. Live Streaming via WebSockets
The executor is tightly coupled with a WebSocket emitter.
- **Node Status**: Emits `running`, `completed`, or `failed` events in real-time.
- **Log Streaming**: Each node runs inside an isolated PTY via `execute_in_pty()` (`engine/pty_runner.py`). Output is streamed line-by-line from the PTY thread back to the asyncio event loop using `asyncio.run_coroutine_threadsafe`, then emitted to the frontend over WebSocket.

### 3. Crash Recovery (Re-Hydration)
The executor supports resuming from a crashed state without re-running completed nodes.
- **Mechanism**: The `/resume` endpoint fetches the *Run State* from MongoDB.
- **Logic**: When the executor initializes, it accepts an `initial_state` dict. Any node present in this dict is marked as `done` immediately, and its result is propagated to children, allowing the graph to "fast-forward" to the point of failure.

### 4. Smart Branching
- **Skip Logic**: If a parent node returns a `SKIP_BRANCH` sentinel, the child node marks itself as skipped and propagates the signal down that branch.
- **Error Handling**: By default, parent failures propagate to children. However, nodes can be designed to handle specific error types (future enhancement).

## Usage Example

```python
from engine.async_runner import AsyncGraphExecutor

workflow_data = {
    "nodes": [...],
    "edges": [...]
}

# 1. Initialize
executor = AsyncGraphExecutor(
    workflow_data,
    emit_event=websocket_emitter,
    thread_id="unique-run-id",
    global_context={"sudo_password": "..."}
)

# 2. Execute
results = await executor.execute()
```
