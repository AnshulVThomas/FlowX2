# Async Graph Executor (v5.0) — Push-Based Engine

## Overview
The `AsyncGraphExecutor` is a **push-based, forward-traversal** execution engine. It starts at designated trigger nodes and pushes results forward through edges, evaluating routing conditions at each hop. This replaces the previous pull-based (backward futures) model.

## Architecture

### Push vs Pull

| Aspect | Old Pull Engine (v4) | New Push Engine (v5) |
|--------|---------------------|---------------------|
| Startup | Fire all nodes simultaneously | Start only trigger nodes |
| Dependencies | Each node `await`s parent futures | Parents push payloads into child inboxes |
| Floating nodes | Execute immediately (bug) | Never reached (by design) |
| Edge evaluation | Child checks parent result | Parent evaluates edge → pushes or skips |
| OR Merge | `asyncio.wait(FIRST_COMPLETED)` loop | Inbox fires on first valid arrival |

### Core Data Structures

```python
# Node lifecycle states
self.node_status = {node_id: "pending" | "running" | "completed" | "skipped" | "failed"}

# Inbox system: parent_id → payload
self.node_inboxes = {node_id: {parent_id: result_payload, ...}}
```

## Execution Flow

1. **Identify triggers** — nodes of type `startNode`, `webhookNode`, `cronNode` with no incoming edges
2. **Kick off triggers** — create `asyncio.Task` for each
3. **Event loop** — `asyncio.wait(FIRST_COMPLETED)` on active tasks:
   - Finished node evaluates each outgoing edge's `behavior`
   - Valid payloads are dropped into child inboxes; blocked payloads become `SKIP_BRANCH`
   - `_check_if_ready()` determines if child should fire based on `wait_strategy`:
     - `"ALL"`: all parents must have delivered (AND-join)
     - `"ANY"`: any non-skip delivery triggers (OR-merge / discriminator)
4. **Repeat** until no active tasks remain

## Edge Behaviors

| Behavior | When parent succeeds | When parent fails |
|----------|---------------------|------------------|
| `conditional` (default) | ✅ Pass | ❌ Skip |
| `failure` | ❌ Skip | ✅ Pass |
| `force` / `always` | ✅ Pass | ✅ Pass |

The frontend cycles edge types via `toggleEdgeType()`:
- **Green dashed** = conditional
- **Orange solid** = force
- **Red dashed** = failure

## Crash Recovery (Re-Hydration)

The engine supports resuming from a crashed state:

1. **`__init__`**: Nodes present in `initial_state` are marked `"completed"`, and their results are pre-filled into children's inboxes
2. **`execute()` step 2.5**: Scans for pending nodes whose inboxes are already full and kicks them off alongside triggers
3. **Normal push loop** takes over from there

## Wait Strategy Protocol

Nodes declare their parent-waiting behavior via `get_wait_strategy()` on the `FlowXNode` base class:

```python
class FlowXNode:
    def get_wait_strategy(self) -> str:
        return "ALL"  # Default: AND-join

class ORMergeNode(FlowXNode):
    def get_wait_strategy(self) -> str:
        return "ANY"  # Discriminator: first valid arrival wins
```

## SKIP_BRANCH Propagation

- If all inbox entries for a node are `SKIP_BRANCH`, the node skips itself and emits `"skipped"` status
- Skip propagation prevents dead branches from triggering downstream nodes

## Usage

```python
from engine.async_runner import AsyncGraphExecutor

executor = AsyncGraphExecutor(
    workflow_data={"nodes": [...], "edges": [...]},
    emit_event=websocket_emitter,
    thread_id="unique-run-id",
    global_context={"sudo_password": "..."},
    initial_state={}  # For crash recovery
)

results = await executor.execute()
# Returns: {"results": {...}, "errors": [...], "status": "COMPLETED"|"FAILED"}
```
