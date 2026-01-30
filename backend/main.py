from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from database.connection import db
from models.workflow import Workflow, WorkflowSummary
from contextlib import asynccontextmanager
from typing import List

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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass

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
