from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database.connection import db
from models.workflow import Workflow, WorkflowSummary
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent)) 
# Add parent directory to sys.path to find 'plugins'
# from dotenv import load_dotenv
# Load root .env
# load_dotenv(Path(__file__).parent.parent / ".env")
from contextlib import asynccontextmanager
from typing import List, Dict

# [REMOVED] Hardcoded CommandNode imports
# from plugins.CommandNode.backend.schema import GenerateCommandRequest, UIResponse, UIRender, ExecutionMetadata

from app.core.session_manager import PtySession

from engine.validator import validate_workflow
from engine.registry import NodeRegistry # [NEW] Import Registry
from langgraph.checkpoint.mongodb import MongoDBSaver
from pymongo import MongoClient
import asyncio
import json
import base64
from config import settings

from routers import bridge

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to the database
    db.connect()
    try:
        database = db.get_db()
        # Create TTL index: Auto-delete memories older than 24 hours (86400 seconds)
        # Ensure we await this as motor is async
        await database.agent_memories.create_index("last_updated", expireAfterSeconds=86400)
        print("✅ TTL Index verified for agent_memories")
    except Exception as e:
        print(f"⚠️ Failed to init TTL index: {e}")
    yield
    # Shutdown: Close the database connection
    db.close()

app = FastAPI(lifespan=lifespan)

# Checkpointer Setup (Tier 3)
sync_mongo_client = MongoClient(settings.MONGODB_URL)
checkpointer = MongoDBSaver(sync_mongo_client)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bridge.router, prefix="/workflow", tags=["Workflow Bridge"])

# [NEW] Dynamic Plugin Router Registration
routers = NodeRegistry.get_routers()
print(f"🔌 Mounting {len(routers)} plugin routers...")
for router in routers:
    app.include_router(router)

# Global error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the error for debugging
    print(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)}
    )

# Catch MongoDB connection errors specifically
try:
    from pymongo.errors import PyMongoError
    
    @app.exception_handler(PyMongoError)
    async def mongodb_exception_handler(request: Request, exc: PyMongoError):
        # print(f"MongoDB error: {exc}") # Still useful for critical db errors? Maybe keep or log to stderr
        return JSONResponse(
            status_code=503,
            content={"detail": "Database connection error", "error": str(exc)}
        )
except ImportError:
    pass  # PyMongo not installed or not using MongoDB

# Connection Manager (Tier 4)
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                pass # print(f"Broadcast error: {e}")

manager = ConnectionManager()

@app.websocket("/ws/workflow")
async def workflow_websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass

@app.websocket("/ws/terminal")
async def websocket_terminal_endpoint(websocket: WebSocket, sudo: bool = False):
    await websocket.accept()
    # print("WebSocket Terminal Connected")
    
    # Create PTY Session (defaults to bash)
    # If sudo is requested, run 'sudo -i' to drop into root shell (interactive password prompt)
    cmd = "sudo -i" if sudo else "bash"
    
    session = PtySession(command=cmd)
    session.start()
    
    loop = asyncio.get_event_loop()
    
    async def pty_reader():
        """Reads output from PTY and sends to WebSocket"""
        try:
            while session.master_fd:
                # Use run_in_executor to avoid blocking the event loop
                data = await loop.run_in_executor(None, session.read, 1024)
                if not data:
                    break
                # Send binary or text. xterm.js likes text/binary. 
                # We'll send text.
                await websocket.send_text(data.decode(errors="ignore"))
        except Exception as e:
            # print(f"PTY Reader Error: {e}")
            pass
            
    # Start reader task
    reader_task = asyncio.create_task(pty_reader())
    
    try:
        while True:
            # Wait for message from frontend (Input or Resize)
            message_text = await websocket.receive_text()
            
            try:
                # Attempt to parse as JSON (for Protocol Messages like RESIZE)
                message = json.loads(message_text)
                
                if isinstance(message, dict) and message.get("type") == "resize":
                    cols = message.get("cols", 80)
                    rows = message.get("rows", 24)
                    session.resize(rows, cols)
                    # print(f"Resized PTY to {rows}x{cols}")
                elif isinstance(message, dict) and message.get("type") == "input":
                    # Structured input
                    data = message.get("data", "")
                    session.write(data.encode())
                else:
                    # Fallback or unknown JSON
                    pass
            except json.JSONDecodeError:
                # Raw input fallback (if frontend sends raw keystrokes)
                session.write(message_text.encode())
                
    except WebSocketDisconnect:
        pass # print("Terminal WebSocket Disconnected")
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        # Cleanup
        if reader_task:
            reader_task.cancel()
        session.terminate()

@app.get("/")
async def read_root():
    return {"message": "Hello World"}

@app.post("/workflows")
async def receive_workflow(workflow: Workflow):
    database = db.get_db()
    # Use upsert to update if exists, otherwise insert
    if workflow.id:
        result = await database.workflows.update_one(
            {"id": workflow.id},
            {"$set": workflow.dict()},
            upsert=True
        )
        return {"status": "success", "received": workflow.name, "id": workflow.id}
    else:
        # Save first, then update with the stringified ID
        workflow_dict = workflow.dict()
        result = await database.workflows.insert_one(workflow_dict)
        new_id = str(result.inserted_id)
        
        await database.workflows.update_one(
            {"_id": result.inserted_id},
            {"$set": {"id": new_id}}
        )
        
        return {"status": "success", "received": workflow.name, "id": new_id}

@app.get("/workflows", response_model=List[WorkflowSummary])
async def get_workflows():
    database = db.get_db()
    workflows = []
    # Only fetch id and name, exclude data
    cursor = database.workflows.find({}, {"name": 1, "id": 1})
    async for document in cursor:
        # Ensure 'id' is present (fallback to _id if missing)
        if "id" not in document or document["id"] is None:
            document["id"] = str(document["_id"])
        
        # Always remove internal MongoDB _id to avoid serialization issues
        document.pop("_id", None)
        workflows.append(document)
    return workflows

@app.get("/workflows/{workflow_id}", response_model=Workflow)
async def get_workflow_details(workflow_id: str):
    database = db.get_db()
    document = await database.workflows.find_one({"id": workflow_id})
    
    if not document:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    # Ensure 'id' is present (fallback to _id if missing)
    if "id" not in document or document["id"] is None:
        document["id"] = str(document["_id"])
    
    # Always remove internal MongoDB _id
    document.pop("_id", None)
    return document

@app.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    database = db.get_db()
    result = await database.workflows.delete_one({"id": workflow_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    return {"status": "success", "message": "Workflow deleted"}

@app.get("/system-info")
async def get_system_info():
    from app.core.system import get_system_fingerprint
    return get_system_fingerprint()

# [REMOVED] generate_command_endpoint - moved to plugins/CommandNode/backend/router.py

# --- EXECUTION ENGINE API (Tier 3) ---

# Global registry for active execution tasks
# Maps thread_id -> asyncio.Task
active_executions: Dict[str, asyncio.Task] = {}

@app.post("/api/v1/workflow/execute")
async def execute_workflow(workflow_data: dict, background_tasks: BackgroundTasks = None):
    """
    Compiles and starts a workflow execution.
    Returns the thread_id for tracking.
    """
    # Debug: Print Workflow Structure
    print("\n" + "="*50)
    print(f"🚀 Executing Workflow: {workflow_data.get('id', 'Unknown ID')}")
    print("="*50)
    
    nodes_dict = workflow_data.get('nodes', [])
    edges_list = workflow_data.get('edges', [])
    
    # Tier 3 Validation: Prevent execution of invalid graphs
    validate_workflow(nodes_dict, edges_list)

    # --- ASYNC EXECUTOR REPLACEMENT ---
    from engine.async_runner import AsyncGraphExecutor
    import uuid
    thread_id = str(uuid.uuid4())
    
    # Extract Global Context (Secrets) from payload
    # Frontend should send 'secrets' or top-level keys
    sudo_password = workflow_data.get("sudo_password") or workflow_data.get("secrets", {}).get("sudo_password")
    global_context = {
        "sudo_password": sudo_password
    }
    
    # Tier 4: Inject WebSocket Emitter
    async def emit_to_frontend(event: str, data: dict):
        import json
        # Wrap in expected format
        try:
            # Inject thread_id so frontend knows which run this belongs to immediately
            data_with_context = {**data, "thread_id": thread_id}
            payload = json.dumps({"type": event, "data": data_with_context})
            await manager.broadcast(payload)
        except Exception as e:
            print(f"Emit error: {e}")

    executor = AsyncGraphExecutor(
        workflow_data, 
        emit_event=emit_to_frontend,
        thread_id=thread_id,
        global_context=global_context
    )

    # Wrapper to run execution and handle registration
    async def run_execution():
        try:
            import os
            loop_count = 0
            MAX_RESTARTS = int(os.getenv("MAX_WORKFLOW_RESTARTS", 3)) # Safety Limit

            while True:
                # Execute the graph
                result_stats = await executor.execute()
                status = result_stats.get("status", "COMPLETED")
                
                # CHECK FOR RESTART SIGNAL
                if status == "RESTART_REQUESTED":
                    loop_count += 1
                    if loop_count > MAX_RESTARTS:
                        print(f"🛑 RESTART LIMIT REACHED ({MAX_RESTARTS}). Stopping.")
                        return {
                            "thread_id": thread_id, 
                            "status": "FAILED",
                            "error": "Restart Limit Reached",
                            "results": result_stats.get("results", {})
                        }
                    
                    print(f"🔄 RESTARTING WORKFLOW (Attempt {loop_count + 1})...")
                    
                    # Notify Frontend of Restart
                    await emit_to_frontend("node_status", {"nodeId": "system", "status": "restarting"})
                    
                    # Reset Executor State (Manually re-init executor methods or just re-run execute?)
                    # The AsyncGraphExecutor is stateful (self.results, self.node_status). 
                    # We MUST re-instantiate it for a clean restart.
                    executor.__init__(
                        workflow_data, 
                        emit_event=emit_to_frontend,
                        thread_id=thread_id,
                        global_context=global_context
                    )
                    continue # Loop again

                # Normal Completion or Failure
                return {
                    "thread_id": thread_id, 
                    "status": status,
                    "logs": result_stats.get("errors", []),
                    "results": result_stats.get("results", {})
                }

        except asyncio.CancelledError:
            print(f"Workflow Execution Cancelled: {thread_id}")
            # Emit cancellation event
            await emit_to_frontend("node_status", {"nodeId": "system", "status": "cancelled"}) 
            return {"status": "CANCELLED", "thread_id": thread_id}
        except Exception as e:
            print(f"Workflow execution failed: {e}")
            import traceback
            traceback.print_exc()
            return {"status": "FAILED", "error": str(e), "thread_id": thread_id}
        finally:
            # Cleanup registry
            if thread_id in active_executions:
                del active_executions[thread_id]

    # Register Task
    task = asyncio.create_task(run_execution())
    active_executions[thread_id] = task
    
    # Wait for completion (or return early if we wanted async fire-and-forget, but user usually awaits result)
    # The current frontend awaits the response, so we await the task here.
    return await task

@app.post("/api/v1/workflow/cancel/{thread_id}")
async def cancel_workflow(thread_id: str):
    if thread_id in active_executions:
        task = active_executions[thread_id]
        task.cancel()
        return {"status": "success", "message": "Cancellation signal sent"}
    else:
        # It might have already finished
        return {"status": "ignored", "message": "Execution not found or already completed"}

@app.post("/api/v1/workflow/resume/{thread_id}")
async def resume_workflow(thread_id: str, payload: dict):
    """
    CRASH RECOVERY:
    1. Fetches the previous Run State from DB (results of completed nodes).
    2. Fetches the Workflow Definition.
    3. Re-hydrates AsyncGraphExecutor with `initial_state`.
    4. Resumes execution (skipping already completed nodes).
    """
    # 1. GET WORKFLOW ID & SECRETS
    workflow_id = payload.get("workflowId")
    sudo_password = payload.get("sudo_password") or payload.get("secrets", {}).get("sudo_password")
    
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflowId is required to resume")
    
    database = db.get_db()
    
    # 2. FETCH WORKFLOW DEFINITION
    workflow_data = await database.workflows.find_one({"id": workflow_id})
    if not workflow_data:
        raise HTTPException(status_code=404, detail="Workflow definition not found")
        
    # 3. FETCH RUN STATE (For Crash Recovery)
    # We look for the document in 'runs' collection with this thread_id
    run_state = await database.runs.find_one({"thread_id": thread_id})
    
    initial_results = {}
    if run_state and "results" in run_state:
        # Format in DB: { "results": { "nodeId": { "status": "...", "data": ... } } }
        initial_results = run_state["results"]
        # Filter out failed nodes? 
        # If a node failed, we probably want to RETRY it, so we should NOT include it in initial_state (which marks it as Done).
        # We only include "completed" nodes.
        initial_results = {
            k: v for k, v in initial_results.items() 
            if v.get("status") == "completed" or v.get("status") == "success"
        }
    
    # 4. RE-EXECUTE WITH STATE
    from engine.async_runner import AsyncGraphExecutor
    
    # Re-inject Emitter
    async def emit_to_frontend(event: str, data: dict):
        import json
        try:
            data_with_context = {**data, "thread_id": thread_id}
            payload = json.dumps({"type": event, "data": data_with_context})
            await manager.broadcast(payload)
        except Exception as e:
            print(f"Emit error: {e}")

    global_context = {
        "sudo_password": sudo_password
    }
    
    executor = AsyncGraphExecutor(
        workflow_data, 
        emit_event=emit_to_frontend,
        thread_id=thread_id,
        global_context=global_context,
        initial_state=initial_results
    )
    
    # We use the same run_execution logic, but we don't start it as a background task because
    # resume is typically synchronous wait in this API design (aligning with execute_workflow).
    # But we should register it in active_executions just in case.
    
    async def run_execution():
        try:
             # Notify Resume
            await emit_to_frontend("node_status", {"nodeId": "system", "status": "resuming"})
            
            result_stats = await executor.execute()
            
            return {
                "thread_id": thread_id, 
                "status": result_stats.get("status", "COMPLETED"),
                "logs": result_stats.get("errors", []),
                "results": result_stats.get("results", {})
            }
        except asyncio.CancelledError:
             await emit_to_frontend("node_status", {"nodeId": "system", "status": "cancelled"}) 
             return {"status": "CANCELLED", "thread_id": thread_id}
        except Exception as e:
            print(f"Resume failed: {e}")
            return {"status": "FAILED", "error": str(e), "thread_id": thread_id}
        finally:
            if thread_id in active_executions:
                del active_executions[thread_id]

    task = asyncio.create_task(run_execution())
    active_executions[thread_id] = task
    
    return await task
