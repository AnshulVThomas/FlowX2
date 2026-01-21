from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel

from backend.graph import graph

app = FastAPI(title="FlowX2 Backend")

class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    configurable: Optional[Dict[str, Any]] = None

@app.post("/chat")
def chat_endpoint(request: ChatRequest):
    inputs = {"messages": request.messages}
    config = {"configurable": request.configurable or {}}
    return graph.invoke(inputs, config)

@app.get("/health")
def health_check():
    return {"status": "ok"}