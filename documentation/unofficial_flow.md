# Unofficial Flow Documentation

## project: FlowX2 Backend with MongoDB

This document outlines the "unofficial" flow for saving workflows in the FlowX2 backend, utilizing a modular structure capable of scaling.

### 1. Architecture Overview

The backend is built with **FastAPI** and uses **MongoDB** for persistence.
Key changes involved refactoring a single `main.py` into a structured application and connecting the frontend via REST API and WebSockets.

### 2. Directory Structure

The backend code is organized as follows:

- **`backend/`**
  - **`database/`**: Contains database connection logic.
    - `connection.py`: Manages the async `MotorClient` connection (`db.connect()`, `db.close()`, `db.get_db()`).
  - **`models/`**: Pydantic models for data validation.
    - `workflow.py`: Defines the `Workflow` schema (name, data, id).
  - **`tests/`**: Test scripts.
    - `test_workflow_api.py`: A script to POST a dummy workflow to the API and verify success.
  - **`main.py`**: The entry point.
    - Configures lifecycle events (startup/shutdown) to handle DB connections.
    - Defines the `/workflows` POST endpoint to save data.
    - Defines the `/ws` WebSocket endpoint for server status.

### 3. Data Flow

1. **Client Request**: A client (e.g., Frontend or Test Script) sends a `POST` request to `http://localhost:8000/workflows`.
   - Payload example:
     ```json
     {
       "name": "My Workflow",
       "data": { "nodes": [], "edges": [] }
     }
     ```

2. **API Layer (`main.py`)**:
   - The `receive_workflow` function receives the request.
   - Validates data using the `Workflow` model.

3. **Database Layer**:
   - The handler calls `db.get_db()` to access the `flowx2` database.
   - Inserts the dictionary representation of the workflow into the `workflows` collection.

4. **Response**:
   - Returns a success status and the new MongoDB document ID.

### 4. Real-time Status (WebSocket)
The application uses a WebSocket connection to monitor server health.
- **Backend**: `/ws` endpoint in `main.py` accepts connections and keeps them alive.
- **Frontend**: `useServerStatus` hook attempts to connect to the backend.
- **UI**: The Navbar displays a green dot if connected, red if disconnected.

### 5. Running the Project

1. **Start MongoDB**:
   ```bash
   docker-compose up -d
   ```
   *(Ensure `backend/docker-compose.yml` is present)*

2. **Start Backend**:
   ```bash
   uvicorn main:app --reload
   ```

3. **Start Frontend**:
   ```bash
   npm run dev
   ```

4. **Test**:
   ```bash
   python tests/test_workflow_api.py
   ```

### 6. Frontend Architecture (State & Efficiency)

The frontend leverages **Zustand** for high-performance state management, optimized for drag-heavy interactions.

- **Global Store (`useWorkflowStore`)**:
  - Manages the list of workflows (`workflows`) and active editor state (`nodes`, `edges`).
  - **Optimization**: The `Navbar` subscribes only to the stable `workflows` list references, while the `Canvas` subscribes directly to the Root State (`nodes`, `edges`). This decoupling prevents layout shifts and re-renders during node dragging.

- **Data Persistence Strategy**:
  - **Local State**: Changes are applied optimistically to the local store for 60fps responsiveness.
  - **Auto-Save**: Critical actions (Node Deletion, Edge Deletion) trigger immediate background saves.
  - **Manual Save**: Clicking "Run" or "Save" persists the active workflow state to MongoDB via the `/workflows` endpoint.

- **Performance Features**:
  - `onlyRenderVisibleElements`: Canvas culling for large graphs.
  - **Stable Selectors**: Preventing React `useSyncExternalStore` infinite loops.
   - **Memoization**: Key components like `StartNode` are memoized to resist unrelated updates.
   
### 7. AI & System Context Architecture

The project now includes an intelligence layer powered by Gemini to generate bash commands based on the user's system context.

#### A. System Fingerprinting
- **Module**: `backend/app/core/system.py`
- **Function**: Automatically detects the host's OS (e.g., Arch Linux), Kernel version, Shell (e.g., /bin/zsh), and Hardware specs.
- **Privacy**: This runs locally on the backend start.

#### B. Context Propagation (Global -> Store -> Local)
To ensure flexibility (allowing users to "simulate" commands for other systems), we implemented a specific data flow:
1.  **Global Load**: On `Canvas` mount, the app fetches `/system-info` and stores it in the **Global Zustand Store**.
2.  **Node Creation**: When a `CommandNode` is dropped, the `Canvas` deeply clones (`structuredClone`) the global context into the new node's local `data`.
3.  **Local Override**: The user can edit the JSON context within the Node's settings. This affects *only* that specific node.
4.  **Reset**: A "Reset to Live" button re-fetches the host info to overwrite the node's local context.

#### C. Intelligence API
- **Endpoint**: `POST /generate-command`
- **Payload**:
  ```json
  {
    "prompt": "Install Docker",
    "system_context": { ... } // Optional: Uses node's overridden context
  }
  ```
- **Response**: Returns a structured `UIResponse` containing:
    - **Code Block**: The executable command.
    - **Description**: What the command does.
    - **System Impact**: Side effects (e.g., "Restarts Service").
    - **Risk Level**: (SAFE, CAUTION, CRITICAL).

#### D. Safety Lock Mechanism
To prevent accidental execution of destructive commands (e.g., `rm -rf`), a friction-based safety system is implemented:
1.  **Risk Analysis**: The AI classifies every generated command.
2.  **Auto-Lock**: If Risk is `CAUTION` or `CRITICAL`, the "Run" button is replaced by a **LOCKED** state.
3.  **Visual Feedback**:
    - **Safe (Green)**: Immediate execution allowed.
    - **Caution (Yellow)**: Auto-reveals risk description in an overlay when unlocked.
    - **Critical (Red)**: Shows "System Impact" in overlay; requires explicit unlock to access the "Run Critical" button.
