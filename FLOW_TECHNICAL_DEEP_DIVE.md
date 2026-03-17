# Workflow Flow: Technical Deep Dive

This document provides a low-level technical analysis of the FlowX2 execution engine, focusing on concurrency models, thread safety, and the state-machine logic that drives graph traversal.

## 🧵 The Concurrency Model: "Push" Traversal

FlowX2 uses a **Push-based** asynchronous traversal engine implemented in `AsyncGraphExecutor`. Unlike traditional pull-based systems, nodes are actively "pushed" into execution as soon as their dependencies are met.

### The Event Loop logic
The core of the traversal is an asynchronous while-loop in `execute()`:
```python
# async_runner.py:L109-111
while active_tasks:
    done, pending = await asyncio.wait(active_tasks, return_when=asyncio.FIRST_COMPLETED)
    active_tasks = pending
```
-   **Parallelism**: Multiple branches are launched as concurrent `asyncio.Task` instances.
-   **Reactivity**: `FIRST_COMPLETED` ensures that as soon as one node finishes, its children are evaluated immediately, maximizing throughput.

---

## 📥 The Inbox & Sentinel System

To manage state across concurrent branches without race conditions, each node has a private **Inbox** (`node_inboxes`).

### The `SKIP_BRANCH` Sentinel
FlowX2 introduces a unique `SKIP_BRANCH` singleton object.
-   **Propagation**: When an edge condition (e.g., a "failure" path when the node succeeded) is not met, the engine pushes `SKIP_BRANCH` to the child's inbox.
-   **Closure**: This ensures the engine can differentiate between a node that is "waiting for data" and a node that is "told to skip".

### Synchronization Logic (`_check_if_ready`)
The engine dynamically decides when a node can trigger based on its **Wait Strategy**:

1.  **AND (Standard)**: Waits until the number of entries in the Inbox exactly matches the number of incoming edges.
2.  **OR (Merge)**: 
    -   Triggers if **any** entry in the Inbox is valid data (not the sentinel).
    -   Triggers if **all** incoming edges have sent `SKIP_BRANCH` (to allow a branch to gracefully terminate).

---

## 🌉 Thread-to-Async Bridging (PTY Runner)

The `ShellTool` and `CommandNode` utilize a PTY to simulate human terminal interaction. This requires bridging blocked I/O with the `asyncio` event loop.

### Thread Isolation
`execute_in_pty` spawns a dedicated worker thread using `loop.run_in_executor`. This prevents `pexpect`'s blocking reads from freezing the main server loop.

### Thread-Safe Callbacks
To stream output back to the UI in real-time, the worker thread must interact with the main thread's loop safely:
```python
# pty_runner.py:L60
asyncio.run_coroutine_threadsafe(on_output(msg, "stderr"), loop)
```
-   **Loop Access**: The PTY worker holds a reference to the main loop.
-   **Socket Dispatch**: The `on_output` callback is a coroutine that eventually calls `manager.broadcast`, pushing the log chunk to the WebSocket.

---

## 📡 WebSocket Event Protocol

FlowX2 uses a structured JSON protocol for real-time UI re-hydration. All events are prefixed with a `thread_id` for multi-tenant safety.

### 1. `node_status`
Updates the visual state (border color, glow) of a node.
```json
{
  "type": "node_status",
  "data": {
    "nodeId": "cmd_123",
    "status": "running" | "completed" | "failed" | "skipped",
    "thread_id": "uuid"
  }
}
```

### 2. `node_log`
Streams standard output/error to the terminal component.
```json
{
  "type": "node_log",
  "data": {
    "nodeId": "cmd_123",
    "log": "Chunk of text...",
    "type": "stdout" | "stderr",
    "thread_id": "uuid"
  }
}
```

---

## 💾 State Persistence & Crash Recovery

The engine is designed to be **Resumable**.

### The `runs` Collection
Every node execution triggers a fire-and-forget update to MongoDB:
```python
# async_runner.py:L248
asyncio.create_task(self._update_db_status(node_id, status_str, result))
```
-   **JSON Serialization**: Results are stored as raw JSON, allowing the `initial_state` to be re-injected into a new `AsyncGraphExecutor` instance.

### Resume Strategy
When `POST /resume/{thread_id}` is called:
1.  **Filter**: The backend retrieves all "success" or "completed" results from the database.
2.  **Short-circuit**: The new `AsyncGraphExecutor` is initialized with these results.
3.  **Jump-start**: The engine automatically marks these nodes as `completed` and skip-traverses to their children, effectively picking up the workflow exactly where it left off (or failing back to the last stable checkpoint).
