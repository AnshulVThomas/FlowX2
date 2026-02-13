from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel

from engine.validator import validate_graph

router = APIRouter()

class ValidateRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

@router.post("/validate")
async def validate_workflow_endpoint(request: ValidateRequest):
    """
    Tier 2: Graph Compiler Pre-Flight Check.
    Returns the validation status map for the graph.
    """
    try:
        # validate_graph returns (validation_map, errors_list)
        validation_map, errors = validate_graph(request.nodes, request.edges)
        
        return {
            "status": "success",
            "validation_map": validation_map,
            "errors": errors
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
