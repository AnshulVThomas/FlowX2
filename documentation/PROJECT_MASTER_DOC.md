# FlowX2 Project Documentation

**Date:** February 14, 2026
**Version:** 5.0 (Push-Based Async Engine)

---

## 1. System Overview

FlowX2 is a high-performance, async-first workflow automation platform for Linux. It enables users to visually construct complex shell command pipelines, powered by a custom **Push-Based Async Execution Engine**.

### Key Features
-   **Visual Editor**: ReactFlow-based interface (60fps) with real-time feedback.
-   **Dual-Terminal System**: Clean separation between execution logs (Output Tab) and interactive debugging (Terminal Tab).
-   **Secure PTY Execution**: Native `pexpect` integration avoids deadlock issues common with `sudo`.
-   **Plugin Architecture**: Fully modular node system loaded dynamically at runtime.

---

## 2. Backend Architecture (`backend/`)

The backend is built with **FastAPI** and **Motor (Async MongoDB)**. It uses a custom engine rather than LangChain/LangGraph to ensure maximum control over process execution and state management.

### 2.1 Core Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **Server** | `main.py` | FastAPI entry point, lifecycle management, global exception handling. |
| **Config** | `config.py` | Centralized configuration (loads `.env`). |
| **Database** | `database/connection.py` | Async MongoDB connection pooling. |
| **Validation** | `routers/bridge.py` | API endpoint bridging Frontend validation triggers to Backend logic. |

### 2.2 The Async Execution Engine (`backend/engine/`)

The heart of FlowX2 is the **AsyncGraphExecutor** (`engine/async_runner.py`).

**Mechanism: Push-Based Forward Traversal**
Unlike pull-based systems that wait for dependencies, FlowX uses an **Inbox Pattern**:
1.  **Triggers**: The engine identifies Start/Webhook nodes and fires them.
2.  **Execution**: Nodes run asynchronously (non-blocking).
3.  **Push**: When a node finishes, it "pushes" its result into the **Inbox** of its children.
4.  **Readiness Check**: A child node monitors its inbox. It triggers *only* when its **Wait Strategy** is satisfied.

**Wait Strategies (`engine/protocol.py`)**:
-   `"ALL"` (Default): Wait for **ALL** incoming edges to deliver a payload (AND-Join).
-   `"ANY"` (ORMergeNode): Fire immediately when **ANY** valid payload arrives (OR-Merge / Race).

**Cycle "Handling"**:
The engine does not explicitly detect cycles. Instead, cycles (A -> B -> A) result in a **Deadlock/Silent Skip**. Since A waits for B and B waits for A, neither ever becomes "Ready". They remain in `pending` state, and the workflow completes successfully without executing the loop.

### 2.3 PTY Runner (`engine/pty_runner.py`)

Handles secure command execution.
-   **No Wrappers**: Spawns `/bin/bash` directly via `pexpect`.
-   **Standard Streams**: Captures `stdout`/`stderr` in real-time.
-   **Sudo Injection**: Monitors stream for `[sudo] password` prompts and accepts the password from the secure context if authorized.

### 2.4 Control Signals & Memory (New in v5.1)

**A. Control Signals (`__FLOWX_SIGNAL__`)**
To allow Agents to control the workflow lifecycle, the engine intercepts specific string patterns in a node's output:
-   `__FLOWX_SIGNAL__STOP:<reason>`: Immediately halts execution. Returns `STOPPED` status.
-   `__FLOWX_SIGNAL__RESTART:<reason>`: Triggers a full workflow restart. Returns `RESTART_REQUESTED`.

**B. Long-Term Memory**
The **ReAct Agent** persists its state to the `agent_memories` MongoDB collection.
-   **Key**: `thread_id` + `node_id`.
-   **Value**: List of past actions and outcomes.
-   **Usage**: On restart, the Agent reads this history to avoid repeating failed actions (infinite loop prevention).

---

## 3. Plugin System (`plugins/`)

FlowX2 is extensible via a standardized Plugin Protocol.

### 3.1 Directory Structure
Each node type is a self-contained module in `plugins/<NodeName>/`:

```text
plugins/CommandNode/
├── manifest.json       # Metadata (ID, Name, Backend Class)
├── frontend/           # React Components (UI)
└── backend/
    ├── node.py         # Logic (inherits FlowXNode)
    └── service.py      # Business Logic (Optional)
```

### 3.2 Registry (`engine/registry.py`)
-   **Dynamic Loading**: Scans `plugins/` on startup.
-   **Mapping**: Maps `node_type` strings to Python classes.
-   **Routers**: Automatically mounts `backend/router.py` if present (e.g., for node-specific APIs).

### 3.3 Node Types
| Node Type | Class | Description | Wait Strategy |
|-----------|-------|-------------|---------------|
| **StartNode** | `StartNode` | Workflow entry point. | `ALL` |
| **CommandNode** | `CommandNode` | Executes shell commands via PTY. | `ALL` |
| **ORMergeNode** | `ORMergeNode` | Flow control discriminator. | `ANY` |
| **VaultNode** | `VaultNode` | Configuration for secrets (not executed). | N/A |
| **ReActAgent** | `ReActAgentNode` | Autonomous AI Engine (Llama 3.3). | `ALL` |
| **ShellTool** | `ShellToolNode` | Capability: Execute Commands. | `ALL` |
| **StopTool** | `StopToolNode` | Control: Stop Workflow. | `ALL` |
| **RestartTool** | `RestartToolNode` | Control: Restart Workflow. | `ALL` |

---

## 4. Frontend-Backend Sync

### 4.1 Validation Bridge
-   **Frontend**: User edits graph -> triggers `validateGraph` hook.
-   **API**: POST `/api/validate` -> `routers/bridge.py`.
-   **Backend**: `engine/validator.py` runs BFS reachability check + Node-level validation.
-   **Result**: Returns status map (`READY` / `FAILED`) to frontend, creating the "Green/Red Shield" icons.
-   **Note**: The validator **does not** currently check for cycles.

### 4.2 Execution Lifecycle
1.  **Run**: Frontend calls `/execute`.
2.  **Init**: Backend creates `AsyncGraphExecutor` with `thread_id`.
3.  **Stream**: Status updates (`running`, `completed`) sent via WebSocket.
4.  **Finish**: Final state saved to MongoDB `runs` collection.

---

## 5. Agentic Workflows (v5.1)

FlowX2 v5.1 introduces the **ReAct Agent**, a "Super-Node" capable of autonomous decision-making.

### 5.1 Architecture
The Agent is designed as a **Brain** that requires **Hands** (Tools) to function.
-   **Brain**: `ReActAgentNode` (uses Groq/Llama 3.3).
-   **Hands**: Specialized Tool Nodes (`ShellTool`, `StopTool`, `RestartTool`).
-   **Connection**: Tools must be connected upstream to the Agent. The Agent dynamically detects available tools from its input memory.

### 5.2 Self-Healing Capabilities
The Agent can inspect the output of previous nodes (e.g., a failed `CommandNode`).
-   **Decision**: It can decide to fix the issue (e.g., `run_shell('sudo systemctl restart nginx')`) and then **Restart** the workflow.
-   **Memory**: Execution history is persisted in MongoDB (`agent_memories`). This allows the Agent to "remember" past failures across restarts.
-   **Infinite Loop Protection**: If the Agent sees it has already tried a fix that failed, it will choose to **Stop** the workflow instead of restarting again.

### 5.3 Configuration
-   **Model**: Defaults to `llama-3.3-70b-versatile`. Configurable via `.env` (`REACT_AGENT_MODEL`).
-   **API Key**: Requires `GROQ_API_KEY_FOR_REACT_AGENT`.
