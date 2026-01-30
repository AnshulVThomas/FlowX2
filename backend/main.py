from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database.connection import db
from models.workflow import Workflow
from contextlib import asynccontextmanager

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

@app.get("/")
async def read_root():
    return {"message": "Hello World"}

@app.post("/workflows")
async def receive_workflow(workflow: Workflow):
    database = db.get_db()
    result = await database.workflows.insert_one(workflow.dict())
    return {"status": "success", "received": workflow.name, "id": str(result.inserted_id)}
