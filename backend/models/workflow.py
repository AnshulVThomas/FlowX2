from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class Position(BaseModel):
    x: float
    y: float

class WorkflowSummary(BaseModel):
    id: str
    name: str

class Node(BaseModel):
    id: str
    type: Optional[str] = "default"
    position: Position
    data: Dict[str, Any] = Field(default_factory=dict)
    width: Optional[float] = None
    height: Optional[float] = None
    selected: Optional[bool] = None
    dragging: Optional[bool] = None
    measured: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"

class Edge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    type: Optional[str] = "default"
    animated: Optional[bool] = False
    data: Optional[Dict[str, Any]] = None
    style: Optional[Dict[str, Any]] = None
    markerEnd: Optional[Dict[str, Any]] = None
    selected: Optional[bool] = None

    class Config:
        extra = "allow"

class WorkflowData(BaseModel):
    nodes: List[Node]
    edges: List[Edge]
    viewport: Optional[Dict[str, Any]] = None

class Workflow(BaseModel):
    name: str
    data: WorkflowData
    id: Optional[str] = None
