from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Workflow(BaseModel):
    name: str
    data: Dict[str, Any]

@app.get("/")
async def read_root():
    return {"message": "Hello World"}

@app.post("/workflows")
async def receive_workflow(workflow: Workflow):
    # TODO: Process the workflow with LangGraph and store in MongoDB
    print(f"Received workflow: {workflow.name}")
    print(f"Workflow Data: {workflow.data}")
    return {"status": "success", "received": workflow.name}
