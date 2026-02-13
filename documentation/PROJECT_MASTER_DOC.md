# FlowX2 Project Documentation

**Date:** February 2, 2026
**Version:** 2.0 (Dual-Terminal & LangGraph Integration)
**Author:** Antigravity (Google DeepMind)

---

## 1. Executive Summary

FlowX2 is an advanced, AI-powered workflow automation platform designed for Linux environments. It allows users to visually chain shell commands, automate complex system tasks, and leverage Generative AI to translate natural language into safe, executable Bash scripts.

The system distinguishes itself through a rigorous focus on **Safety** (Risk Analysis, Sudo handling), **Performance** (60fps ReactFlow rendering), and **Developer Experience** (Modular Node Protocol).

---

## 2. System Architecture

### 2.1 Frontend Architecture (React + Zustand)
The frontend is built for high-performance visual interaction using **ReactFlow**.

*   **State Management**: Uses **Zustand** with a "Dual-Subscription" pattern.
    *   **Global Store**: Manages the list of workflows.
    *   **Canvas Store**: Subscribes directly to high-frequency changes (node dragging) to prevent full-app re-renders.
*   **Dual-Terminal System (IDE Pattern)**:
    *   **Concept**: Separates "Execution Logs" from "Interactive Debugging".
    *   **Implementation**: A custom Tab Bar switch between a read-only Stream View and a fully interactive PTY Session.
    *   **Performance**: Uses "Lazy Connection" logic. The interactive WebSocket only connects when the user explicitly opens the "TERMINAL" tab, saving resources.
*   **Visual Feedback**:
    *   **Border Animations**: Nodes use specific border colors/pulses to indicate state (Generating, Running, Validation Error, Execution Error).
    *   **Validation Shield**: A dedicated icon on every node that reflects the backend's pre-flight validation status.

### 2.2 Backend Architecture (FastAPI + LangGraph)
The backend is a strictly typed, event-driven engine.

*   **Modular Node Architecture**:
    *   Located in `backend/nodes/`.
    *   Each node type (e.g., `command`, `start`) has its own directory containing:
        *   `node.py`: The execution logic implementing `FlowXNode` protocol.
        *   `schema.py`: Pydantic models.
        *   `service.py`: Auxiliary services (e.g., AI Generation).
*   **LangGraph Integration**:
    *   The workflow graph is compiled into a generic state machine.
    *   **Checkpointing**: All states are persisted to MongoDB, allowing workflows to be paused (e.g., for Sudo password) and Resumed exactly where they left off.
*   **Safety Engine**:
    *   **Fail-Fast Sudo**: Commands requiring root triggers an immediate interrupt if no password is cached.
    *   **Secure Injection**: Passwords are injected via `stdin` (`echo 'pass' | sudo -S`) to prevent leakages in process lists or logs.

---

## 3. Core Features

### 3.1 AI Command Generation
*   **Input**: User types "Install Docker".
*   **Process**: System captures OS context (Arch Linux, Kernel 6.1) -> Sends to Gemini model -> Generates optimal `pacman` command.
*   **Risk Analysis**: The AI assigns a Risk Level (SAFE, CAUTION, CRITICAL). "CRITICAL" commands lock the UI until manually approved.

### 3.2 The Dual-Terminal Experience
One of FlowX2's signature features is the decoupling of process output from user interaction.

| Feature | Output Tab | Terminal Tab |
| :--- | :--- | :--- |
| **Purpose** | Watch the running workflow | Manually debug or check files |
| **Connection** | `ws://.../workflow` (Broadcast) | `ws://.../terminal` (Private PTY) |
| **Input** | Read-Only | Fully Interactive (xterm.js) |
| **Lifecycle** | Persists during workflow run | Created on demand, destroyed on close |

### 3.3 Visual Validation System
The UI provides immediate feedback on the validity of the graph.

*   Priority Order for Border Colors:
    1.  **Selection** (Blue)
    2.  **Running** (Indigo Pulse)
    3.  **Password Required** (Amber Pulse)
    4.  **Validation Failed** (Amber Pulse - Configuration Error)
    5.  **Execution Failed** (Red - Runtime Error)
    6.  **Success** (Green)

---

## 4. Developer Guide

### 4.1 Adding a New Node Type
To extend FlowX2, follow the **Modular Node Protocol**:

1.  **Create Directory**: `backend/nodes/mynode/`
2.  **Implement Protocol**:
    ```python
    from engine.protocol import FlowXNode
    class MyNode(FlowXNode):
        def validate(self, data): ...
        async def execute(self, ctx, payload): ...
    ```
3.  **Register**: Add to `backend/engine/validator.py`:
    ```python
    NodeRegistry.register("myNode", MyNode)
    ```

### 4.2 Database Schema
*   **Workflows Collection**: Stores the definition (JSON).
*   **Checkpoints Collection**: Stores the runtime state (LangGraph Checkpointer).

---

## 5. Usage Guide

1.  **Create Workflow**: Click "+" in the navbar.
2.  **Add Node**: Drag "Command Node" from the sidebar.
3.  **Generate**: Type a prompt ("Update System") and hit Generate.
4.  **Connect**: Draw an edge from Start Node to Command Node.
5.  **Run**: Click the Play button.
    *   Watch logs in the **OUTPUT** tab.
    *   If it fails (e.g., file not found), open **TERMINAL** tab to investigate manually `ls -la`.
