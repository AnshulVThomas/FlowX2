# FlowX Engine Architecture & Plugin System

This document explains the core execution flow and how the plugin system integrates with the execution engine.

---

## 1. High-Level Architecture

FlowX uses a **Push-Based Async Graph Execution Engine**. The engine starts at trigger nodes and pushes results forward through edges, evaluating routing conditions at each hop.

### Key Components

1.  **Node Registry (`backend/engine/registry.py`)**
    -   Dynamically loads plugins from `plugins/` directory.
    -   Maps `node_type` strings (e.g., "commandNode") to Python classes.

2.  **Node Protocol (`backend/engine/protocol.py`)**
    -   Defines the `FlowXNode` base class with `execute()`, `validate()`, `get_wait_strategy()`.
    -   Nodes declare their parent-waiting behavior: `"ALL"` (AND-join) or `"ANY"` (OR-merge).

3.  **Async Executor (`backend/engine/async_runner.py`)**
    -   **Push-based forward traversal** — starts at triggers, pushes through edges.
    -   **Inbox system** — parents deposit results into child inboxes; children fire when ready.
    -   **Skip Propagation** — Intelligent handling of skipped branches (`SKIP_BRANCH`).
    -   Manages concurrency, edge routing, logging, and WebSocket status updates.
    -   Supports crash recovery via `initial_state` re-hydration.

4.  **PTY Runner (`backend/engine/pty_runner.py`)**
    -   The low-level workhorse for command execution.
    -   Provides **Pure Dynamic Streaming** (reactive auto-answer for sudo).
    -   Ensures deadlock-free execution without bash wrappers.

---

## 2. The Plugin System

Everything in FlowX is a Plugin. The core engine is just a scheduler; the plugins do the work.

### Plugin Structure (`plugins/<PluginName>/`)

Each plugin folder follows strict convention:

```
plugins/CommandNode/
├── manifest.json       # Metadata (ID, Name, Backend Class)
├── frontend/           # React Components
│   └── index.tsx       # UI Logic
└── backend/
    ├── node.py         # The Execution Logic (Python Class)
    ├── schema.py       # Pydantic Models (Optional)
    └── service.py      # Business Logic / AI Integration (Optional)
```

### How Plugins are Loaded

1.  **Backend Startup (`main.py`)**:
    -   Calls `NodeRegistry.load_plugins()`.
    -   Scans `plugins/` for `manifest.json`.
    -   Dynamically imports the `backend_class` specified in manifest.

2.  **Frontend Startup**:
    -   Vite scans `plugins/*/frontend/index.tsx`.
    -   Dynamically registers components in the Node Palette.

### Execution Flow: Step-by-Step

When you click "Run Workflow":

1.  **Frontend**: Sends JSON payload to `/api/v1/workflow/execute`.
2.  **API**: Instantiates `AsyncGraphExecutor`.
3.  **Executor** (push-based):
    -   Identifies trigger nodes (`startNode`, `webhookNode`, etc.).
    -   Executes triggers first.
    -   On completion, evaluates outgoing edges (`conditional`, `force`, `failure`).
    -   Drops result (or `SKIP_BRANCH`) into child node's inbox.
    -   Checks if child is ready (`_check_if_ready` using `wait_strategy`).
    -   Fires ready children with valid inputs (skips filtered out).
4.  **Plugin (`node.py`)**:
    -   Executes specific logic (e.g., PTY command, OR merge).
    -   Streams logs back via `emit("node_log", ...)` callback.
    -   Returns `{"status": "success", "results": ...}`.
5.  **Executor**:
    -   Pushes result forward to children.
    -   Floating/disconnected nodes are never reached.

---

## 3. The PTY Execution Layer

The core innovation is in `pty_runner.py`.

-   **Zero Wrappers**: Standard `subprocess` approach deadlock with sudo. FlowX uses `pexpect` native spawning.
-   **Reactive Auto-Answer**: The engine parses the stdout stream in real-time. If it sees `[sudo] password`, it injects the password from the **Secure Vault Context**.
-   **Fail-Fast**: If a node is unlocked (no password context) but asks for sudo, the engine aborts immediately to prevent hangs.

---

## 4. Development Workflow

To add a new feature (e.g., "Docker Node"):

1.  Create `plugins/DockerNode/`.
2.  Define `manifest.json` (`id="dockerNode"`).
3.  Implement `backend/node.py` (inherit from `FlowXNode`, implement `execute`).
4.  Override `get_wait_strategy()` if needed (e.g., `"ANY"` for merge nodes).
5.  Implement `frontend/index.tsx` (React component).
6.  Restart Backend. The registry auto-discovers it.

### Existing Plugins

| Plugin | Type | Wait Strategy | Purpose |
|--------|------|--------------|--------|
| StartNode | Trigger | ALL | Entry point, starts workflow |
| CommandNode | Execution | ALL | Runs shell commands via PTY |
| VaultNode | Config | N/A | Stores secrets (not executed) |
| ORMergeNode | Flow Control | ANY | Discriminator — first branch wins |
