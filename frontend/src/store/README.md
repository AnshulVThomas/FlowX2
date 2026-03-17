# Frontend State Store (`useWorkflowStore`)

The `useWorkflowStore` is the central nervous system of the FlowX2 frontend. Built using **Zustand**, it provides a high-performance, reactive state management layer that synchronizes the **React Flow** canvas with the backend execution engine.

## 🚀 Core Responsibilities

-   **Canvas Orchestration**: Manages the `nodes` and `edges` arrays for React Flow, handling additions, deletions, and connections.
-   **Persistence Hub**: Automatically sanitizes and saves workflow state to MongoDB via the API service.
-   **Execution Controller**: Triggers backend graph traversal, manages execution thread IDs, and handles "Sudo Required" interrupts.
-   **Real-time Synchronization**: Maintains a persistent WebSocket connection to re-hydrate the UI with node statuses and log streams in real-time.
-   **Validation Gatekeeper**: Interacts with the backend validator to display per-node error states and critical topology warnings.

## 🏗 Technical Deep Dive

### 1. React Flow State Management
The store implements the standard React Flow change handlers, but adds persistence logic.
-   **`onNodesChange` & `onEdgesChange` (L196-212)**: Uses standard `applyNodeChanges` but triggers an auto-save if a node/edge is removed, ensuring the backend stays in sync.
-   **`updateNodeData` (L238-251)**: The primary method for plugins to update their internal configuration without refreshing the entire store.

### 2. Secure Execution Flow
The `executeGraph` action handles the complex handshakes required for autonomous execution.
-   **Sudo Validation (L376-388)**: Checks if any node in the graph has a `sudoLock`. It automatically retrieves the password from the `VaultNode` if it exists, otherwise it throws a `SudoRequiredError` to trigger a UI prompt.
-   **Dirty State Sanitization (L314-325)**: Before saving or executing, nodes are "cleaned" of ephemeral runtime fields (like `execution_status` or `thread_id`) to ensure the stored state is pure.
-   **Autonomous Reset (L393-409)**: Before starting a run, the store resets all nodes to an `idle` state, clearing previous log buffers and status indicators.

### 3. Real-time WebSocket Hub
The `connectGlobalSocket` method (L549-664) turns the store into a reactive event bus.
-   **Node Status Updates**: Listens for `node_status` events to update visual borders (Green/Red) and the `StartNode` progress state.
-   **Sliding Window Logging**: Consumes `node_log` events and maintains a capped buffer (last 100 entries) in `node.data.logs` for buffered UI re-hydration.
-   **Interrupt Handling**: Listens for `interrupt` signals to set nodes to `attention_required` (Yellow), triggering the "Resume/Sudo" overlays.

## 📊 State Schema

| Property | Type | Description |
| :--- | :--- | :--- |
| `nodes` | `Node[]` | The source of truth for all React Flow components. |
| `edges` | `Edge[]` | The topology mapping for graph traversal. |
| `activeThreadId`| `string \| null` | The ID of the currently running backend task. |
| `validationStatus` | `Record<string, string>` | Map of `nodeId` to `READY` or `VALIDATION_FAILED`. |
| `isDirty` | `boolean` | Tracks if the editor has unsaved changes. |

## 🔌 API Integration
The store acts as a bridge to the following API services:
-   **`fetchWorkflowDetails`**: On-demand hydration of graph metadata.
-   **`apiSaveWorkflow`**: Persistent storage of sanitized JSON.
-   **`executeWorkflow`**: The primary trigger for the backend `AsyncGraphExecutor`.
-   **`cancelWorkflow`**: Signal-based interruption of the active thread.

## 💡 Best Practices for Developers
1.  **Direct Updates**: Always use `updateNodeData(id, ...)` to modify node state. Mutating `nodes` directly will bypass the persistence logic.
2.  **Clean State**: Do not store non-serializable objects (functions, huge binary blobs) in node data; the store's auto-save logic expects pure JSON.
3.  **Event Listening**: If your component needs real-time logs, listen to the global event bus (`node-log-${nodeId}`) dispatched by the store.
