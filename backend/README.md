# FlowX2 Backend Core

The FlowX2 backend is a high-performance orchestration server built with **FastAPI**. It serves as the bridge between the interactive React frontend and the LangGraph-powered execution engine, managing everything from PTY terminal sessions to autonomous agent loops.

## 🚀 Key Responsibilities

-   **Server Lifespan Management**: Orchestrates database connection, TTL index verification, and filesystem watcher initialization.
-   **Dynamic Plugin System**: Automatically discover and mounts API routers from the `plugins/` directory.
-   **Terminal-over-WebSocket**: Provides a low-latency bridge between xterm.js in the browser and PTY sessions on the host.
-   **Async Graph Execution**: Manages the lifecycle of workflow runs, including stateful restarts and cancellation.
-   **Persistence Layer**: Handles CRUD operations for workflow definitions and execution histories in MongoDB.

## 🏗 Technical Architecture

## 🏗 Technical Architecture & Workflow

### 1. Request Lifecycle
Every API request follows a structured path through the backend:
1.  **Middleware**: `CORSMiddleware` handles cross-origin requests.
2.  **Validation**: Pydantic models in `models/workflow.py` validate incoming JSON against the expected schema.
3.  **Authentication (Tier 4)**: Currently handled via `sudo` passwords passed in the execution payload.
4.  **Route Handler**: Standard FastAPI dependency injection for DB access and background task scheduling.

### 2. Execution Workflow (FastAPI -> Engine)
When a user clicks "Run" in the frontend, the following sequence occurs:

```mermaid
sequenceDiagram
    participant FE as React Frontend
    participant API as FastAPI (/execute)
    participant VAL as Validator
    participant ENG as AsyncGraphExecutor
    participant WS as WebSocket Manager (Broadcaster)

    FE->>API: POST Workflow Data
    API->>VAL: validate_workflow()
    VAL-->>API: OK / HTTPException
    API->>ENG: Initialize(thread_id, context)
    API-->>FE: Return thread_id (200 OK)
    
    async loop Execution
        ENG->>ENG: Process Node
        ENG->>WS: broadcast(node_status: running)
        ENG->>ENG: Logic Execution
        ENG->>WS: broadcast(node_status: completed)
    end
```

### 3. API Subsystems

#### **Workflow Persistence (CRUD)**
-   **Storage**: Workflows are stored in the `workflows` collection in MongoDB.
-   **Upsert Logic**: The `POST /workflows` endpoint handle both creation (using generated `_id`) and updates (mapping `id` consistently).
-   **ID Mapping**: Transparent translation between MongoDB's `_id` and the application's UUID `id`.

#### **The Execution Engine API**
-   **`/execute`**: The entry point. It converts the static graph into a runnable `asyncio.Task`.
-   **`/cancel/{id}`**: Interrupts the running `asyncio.Task`. The engine uses a cleanup hook to revert partial changes where possible.
-   **`/resume/{id}`**: A sophisticated "Crash Recovery" system. It queries the `runs` collection for the last known good state and re-hydrates the executor, skipping all nodes marked as `success`.

#### **Real-time Communication (WebSocket Hub)**
The server maintains a global `ConnectionManager` to keep all connected clients synchronized:
-   **Heartbeats**: `/ws` keeps the session alive.
-   **Broadcasts**: `/ws/workflow` is used for engine events (node transitions, log streaming).
-   **Terminal**: `/ws/terminal` is a dedicated binary/text bridge specifically for PTY sessions.

## 🛡 Fault Tolerance & Security

-   **MongoDB TTL**: Automatically purges stale agent memories after 24 hours (`expireAfterSeconds=86400`).
-   **Graceful Shutdown**: The `lifespan` handler captures `SIGTERM`, cancelling all `active_executions` and closing the file watcher before the event loop stops.
-   **Arg Redaction**: Specifically in the `ShellTool` integration (vía `main.py` context), it prevents prompt injection by scanning tool outputs for command-override patterns.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/workflows` | `POST/GET` | Manage workflow definitions. |
| `/api/v1/workflow/execute` | `POST` | Start a new execution thread. |
| `/api/v1/workflow/cancel/{id}` | `POST` | Abort a running task. |
| `/api/v1/workflow/resume/{id}` | `POST` | Recover a failed/crashed execution from DB state. |
| `/ws/workflow` | `WS` | Global event broadcast (node status updates). |
| `/ws/terminal` | `WS` | Direct interactive PTY bridge. |

## 🛡 Security & Error Handling
-   **CORS**: Configured with strict credential handling for local development.
-   **Global Exception Handlers**: Captures unhandled backend errors and specific `PyMongoError` database disconnections to return clean JSON errors to the frontend.
-   **Background Task Registry**: Tracks all `active_executions` in a global dictionary to allow for remote cancellation.

## 💡 Best Practices
-   **Thread IDs**: Every execution run is assigned a unique `thread_id` and `run_id`. Use these for log aggregation and debugging.
-   **MongoDB TTL**: Agent memories are capped with a 24-hour TTL index to prevent database bloat.
-   **Cancellation**: Always use the `/cancel` endpoint rather than killing the process to ensure PTY sessions and file watchers are cleaned up properly.
