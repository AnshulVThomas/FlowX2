# OR Merge Node (Discriminator)

## Overview
The OR Merge node is a **Flow Control** plugin that implements the Discriminator pattern. When multiple parallel branches feed into it, only the **first valid branch** to complete triggers downstream execution. All subsequent arrivals are ignored.

## Plugin Structure

```
plugins/ORMergeNode/
├── manifest.json          # id: "orMergeNode", category: "Flow Control"
├── backend/
│   └── node.py            # wait_strategy: "ANY", pass-through execute
└── frontend/
    └── index.tsx           # White card, amber accents, GitMerge icon
```

## How It Works

### Engine Integration

The OR Merge uses the `wait_strategy` protocol to declare `"ANY"` instead of the default `"ALL"`:

```python
def get_wait_strategy(self) -> str:
    return "ANY"
```

This tells the engine's `_check_if_ready()` to fire the node as soon as **any** parent delivers a valid (non-skip) payload to its inbox, rather than waiting for all parents.

### Execution

The `execute()` method is a pure pass-through:
- Receives the winning branch's payload from `inputs`
- Always returns `status: "success"` (the merge operation itself is successful)
- Packs the winner's data inside `output` for downstream inspection
- Records which branch won via `_merged_from`

### Why Always "success"?

If the OR Merge inherited the winner's failed status, downstream `conditional` edges would block. The merge "cleans" the pipeline — downstream nodes see a successful parent and execute normally. The original data (including any failure info) is still accessible in `output`.

## Example Workflow

```
Start → [Command A (sleep 5), Command B (echo fast)] → OR Merge → Command C
```

1. Both A and B start in parallel
2. B finishes first (echo is instant) → pushed to OR Merge inbox
3. OR Merge fires immediately with B's result → pushes to C
4. A finishes 5 seconds later → inbox already has a winner, `_check_if_ready()` returns `False`
5. C executes with B's output

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| All branches skip | OR Merge skips itself, emits `"skipped"` |
| First branch crashes (Python exception) | Treated as skip, race continues with remaining |
| First branch fails gracefully (exit code ≠ 0) | Edge behavior evaluated — `conditional` rejects it, race continues |
| Only one branch connected | Behaves like a normal pass-through |
