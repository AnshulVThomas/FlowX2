# Unofficial Flow Documentation

## project: FlowX2 Backend with MongoDB

This document outlines the "unofficial" flow for saving workflows in the FlowX2 backend, utilizing a modular structure capable of scaling.

### 1. Architecture Overview

The backend is built with **FastAPI** and uses **MongoDB** for persistence.
Key changes involved refactoring a single `main.py` into a structured application.

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

### 4. Running the Project

1. **Start MongoDB**:
   ```bash
   docker-compose up -d
   ```
   *(Ensure `backend/docker-compose.yml` is present)*

2. **Start Backend**:
   ```bash
   uvicorn main:app --reload
   ```

3. **Test**:
   ```bash
   python tests/test_workflow_api.py
   ```
