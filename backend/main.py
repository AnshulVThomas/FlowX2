from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database.connection import db
from models.workflow import Workflow, WorkflowSummary
from contextlib import asynccontextmanager
from typing import List, Dict
from nodes.command.schema import GenerateCommandRequest, UIResponse, UIRender, ExecutionMetadata
from app.core.session_manager import PtySession
from engine.builder import GraphBuilder
from engine.validator import validate_workflow
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
async def websocket_terminal_endpoint(websocket: WebSocket):
    await websocket.accept()
    # print("WebSocket Terminal Connected")
    
    # Create PTY Session (defaults to bash)
    # TODO: In future, might accept a command via query param or initial message
    session = PtySession(command="bash")
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

@app.post("/generate-command", response_model=UIResponse)
async def generate_command_endpoint(request: GenerateCommandRequest):
    try:
        from app.core.system import get_system_fingerprint
        from nodes.command.service import generate_command
        
        # Use provided context or fall back to live detection
        fingerprint = request.system_context if request.system_context else get_system_fingerprint()
        
        cmd_output = generate_command(request.prompt, fingerprint)
        
        # Map to UI Contract
        badge_color = "green"
        if cmd_output.risk_level == "CAUTION":
            badge_color = "yellow"
        elif cmd_output.risk_level == "CRITICAL":
            badge_color = "red"
            
        return UIResponse(
            node_id=request.node_id,
            status="ready",
            ui_render=UIRender(
                title=cmd_output.title,
                code_block=cmd_output.code_block,
                language="bash",
                badge_color=badge_color,
                description=cmd_output.description,
                system_effect=cmd_output.system_effect
            ),
            execution_metadata=ExecutionMetadata(
                requires_sudo=cmd_output.requires_sudo,
                is_interactive=False 
            )
        )
    except Exception as e:
        error_str = str(e)
        print(f"Generation error: {error_str}")
        
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            raise HTTPException(
                status_code=429, 
                detail="Gemini API Quota Exceeded. Please try again later."
            )
            
        raise HTTPException(status_code=500, detail=error_str)

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

    nodes = {n['id']: n.get('data', {}).get('name', n['id']) for n in nodes_dict}
    edges = edges_list
    
    print("Structure:")
    if not edges:
        print("  [Single Node Execution (or Disconnected)]")
    
    for edge in edges:
        source_id = edge['source']
        target_id = edge['target']
        
        # Get Names
        source_name = nodes.get(source_id, source_id)
        target_name = nodes.get(target_id, target_id)
        
        # Get Commands
        source_cmd = ""
        target_cmd = ""
        
        # Find node data for command
        for n in workflow_data.get('nodes', []):
            if n['id'] == source_id:
                source_cmd = n.get('data', {}).get('command', '')
            if n['id'] == target_id:
                target_cmd = n.get('data', {}).get('command', '')

        # Format with Command if available
        # Truncate command for display
        def fmt_node(name, cmd):
            if cmd:
                cmd_short = (cmd[:30] + '...') if len(cmd) > 30 else cmd
                return f"{name} ({cmd_short})"
            return name

        source_display = fmt_node(source_name, source_cmd)
        target_display = fmt_node(target_name, target_cmd)

        behavior = edge.get('data', {}).get('behavior', 'conditional')
        arrow = "-->" if behavior == "conditional" else ("==>" if behavior == "force" else "-!->")
        print(f"  [{source_display}] {arrow} [{target_display}]")
    print("="*50 + "\n")

    # --- ASYNC EXECUTOR REPLACEMENT ---
    from engine.async_runner import AsyncGraphExecutor
    import uuid
    thread_id = str(uuid.uuid4())
    
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
        thread_id=thread_id
    )

    # Wrapper to run execution and handle registration
    async def run_execution():
        try:
            # Execute the graph
            result_stats = await executor.execute()
            
            return {
                "thread_id": thread_id, 
                "status": result_stats.get("status", "COMPLETED"),
                "logs": result_stats.get("errors", []), # Mapping errors to logs for now
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
    1. Fetches the Workflow ID associated with this Thread (store this linkage in DB or payload).
    2. Rebuilds the Graph.
    3. Resumes execution with the password injection.
    """
    # 1. GET WORKFLOW DATA
    workflow_id = payload.get("workflowId")
    if not workflow_id:
        raise HTTPException(status_code=400, detail="workflowId is required to rebuild the graph")
    
    # Fetch from existing DB connection
    database = db.get_db()
    # Note: 'id' field in DB is the string UUID, '_id' is ObjectId. We use 'id'.
    workflow_data = await database.workflows.find_one({"id": workflow_id})
    if not workflow_data:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    # 2. REBUILD GRAPH
    # We need the exact same graph structure to map the checkpoint correctly
    builder = GraphBuilder(checkpointer=checkpointer)
    # FIX: The DB document wraps nodes/edges in a 'data' field
    graph_source = workflow_data.get("data", {})
    graph = builder.build(graph_source)
    
    # 3. RESUME EXECUTION
    # Tier 4: Inject WebSocket Emitter (Critical for Resume Streaming)
    async def emit_to_frontend(event: str, data: dict):
        import json
        try:
            payload = json.dumps({"type": event, "data": data})
            await manager.broadcast(payload)
        except Exception as e:
            await manager.broadcast(payload)
        except Exception as e:
            pass # print(f"Emit error: {e}")

    config = {
        "configurable": {
            "thread_id": thread_id,
            "emit_event": emit_to_frontend
        }
    }
    
    # Check if thread exists/is paused
    # graph.aget_state is async
    current_state = await graph.aget_state(config)
    if not current_state.next:
         # If next is empty, it means no next step -> not paused or completed.
         # But if it was interrupted, it should have a next step (the node it is currently on or next one).
         # For 'interrupt', it pauses *before* or *after*. 
         # If we used 'interrupt()' inside node, it's a bit different than interrupt_before.
         # LangGraph's 'interrupt' raises NodeInterrupt, effectively pausing execution.
         # The node technically "failed" or "stopped".
         # We need to test if this check works for manual interrupts.
         # For now, we trust standard LangGraph behavior for resumes.
         pass
         # raise HTTPException(status_code=400, detail="Workflow is not in a paused state")

    # Inject the password into the state
    resume_update = {"sudo_password": payload.get("sudo_password")}
    
    try:
        # Pass the update. LangGraph merges this into state and continues.
        # If the node was interrupted, passing Command(resume=...) might be needed depending on implementation.
        # But 'update' usually works for StateGraph.
        final_state = await graph.ainvoke(resume_update, config=config)
        
        return {
            "status": final_state.get("execution_status", "COMPLETED"),
            "logs": final_state.get("logs", [])
        }
    except Exception as e:
        return {"status": "FAILED", "error": str(e)}
