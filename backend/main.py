from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from database.connection import db
from models.workflow import Workflow, WorkflowSummary
from contextlib import asynccontextmanager
from typing import List
from app.schemas.command import GenerateCommandRequest, UIResponse, UIRender, ExecutionMetadata
from app.core.session_manager import PtySession
import asyncio
import json
import base64

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to the database
    db.connect()
    yield
    # Shutdown: Close the database connection
    db.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        print(f"MongoDB error: {exc}")
        return JSONResponse(
            status_code=503,
            content={"detail": "Database connection error", "error": str(exc)}
        )
except ImportError:
    pass  # PyMongo not installed or not using MongoDB

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
    print("WebSocket Terminal Connected")
    
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
            print(f"PTY Reader Error: {e}")
            
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
                    print(f"Resized PTY to {rows}x{cols}")
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
        print("Terminal WebSocket Disconnected")
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

@app.get("/system-info")
async def get_system_info():
    from app.core.system import get_system_fingerprint
    return get_system_fingerprint()

@app.post("/generate-command", response_model=UIResponse)
async def generate_command_endpoint(request: GenerateCommandRequest):
    try:
        from app.core.system import get_system_fingerprint
        from app.services.generator import generate_command
        
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
                title="Generated Command",
                code_block=cmd_output.bash_script,
                language="bash",
                badge_color=badge_color
            ),
            execution_metadata=ExecutionMetadata(
                requires_sudo=cmd_output.requires_sudo,
                is_interactive=False 
            )
        )
    except Exception as e:
        print(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
