# FlowX Engine Architecture & Plugin System

This document explains the core execution flow and how the plugin system integrates with the execution engine.

---

## 1. High-Level Architecture

FlowX uses a **Dynamic Async Graph Execution Engine** built on `langgraph`. The system compiles frontend nodes and edges into an executable graph at runtime.

### Key Components

1.  **Node Registry (`backend/engine/registry.py`)**
    -   Dynamically loads plugins from `plugins/` directory.
    -   Maps `node_type` strings (e.g., "commandNode") to Python classes.

2.  **Graph Builder (`backend/engine/builder.py`)**
    -   Compiles the JSON workflow execution graph into a `langgraph` StateGraph.
    -   Validates connections and injects global context (secrets, thread_id).

3.  **Async Executor (`backend/engine/async_runner.py`)**
    -   Orchestrates execution step-by-step.
    -   Manages concurrency, logging, and status updates via WebSocket.
    -   Delegates actual work to the Plugin Classes.

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

### execution Flow: Step-by-Step

When you click "Run Workflow":

1.  **Frontend**: Sends JSON payload to `/api/v1/workflow/execute`.
2.  **API**: Instantiates `AsyncGraphExecutor`.
3.  **Executor**:
    -   Traverses the graph.
    -   For each node, calls `NodeRegistry.get_node(node_type)`.
    -   Instantiates the plugin class: `node_instance = PluginClass(node_data)`.
    -   Calls `await node_instance.execute(context, payload)`.
4.  **Plugin (`node.py`)**:
    -   Executes specific logic (e.g., specific PTY command).
    -   Streams logs back via `emit("node_log", ...)` callback.
    -   Returns `{"status": "success", "results": ...}`.
5.  **Executor**:
    -   Updates Graph State.
    -   Proceeds to next node.

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
4.  Implement `frontend/index.tsx` (React component).
5.  Restart Backend. The registry auto-discovers it.
