from typing import List, Dict, Any, Literal, TypedDict
import re
from fastapi import HTTPException

class ValidationError(TypedDict):
    nodeId: str
    message: str
    level: Literal["CRITICAL", "WARNING"]

def validate_workflow(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> bool:
    """
    Validates the workflow structure and content.
    Returns True if valid, raises HTTPException if CRITICAL errors exist.
    """
    errors: List[ValidationError] = []

    # --- Topological Check ---
    start_nodes = [n for n in nodes if n.get('type') == 'startNode']
    start_count = len(start_nodes)

    if start_count == 0:
        errors.append({
            "nodeId": "global",
            "message": "No Start Node found",
            "level": "CRITICAL"
        })
    elif start_count > 1:
        for node in start_nodes:
            errors.append({
                "nodeId": node.get('id', 'unknown'),
                "message": "Multiple Start Nodes found",
                "level": "CRITICAL"
            })

    # --- Connectivity Check ---
    target_handles = set()
    for edge in edges:
        target_handles.add(edge.get('target'))

    for node in nodes:
        node_id = node.get('id')
        if node.get('type') != 'startNode':
            if node_id not in target_handles:
                errors.append({
                    "nodeId": node_id,
                    "message": "Node is unreachable (Orphan)",
                    "level": "WARNING"
                })

    # --- Command Node Logic ---
    command_nodes = [n for n in nodes if n.get('type') == 'commandNode']
    placeholder_pattern = re.compile(r"<[^>]+>")

    for node in command_nodes:
        node_id = node.get('id')
        data = node.get('data', {})
        command = data.get('command', '')

        # Empty Check
        if not command or not command.strip():
            errors.append({
                "nodeId": node_id,
                "message": "Command is empty",
                "level": "CRITICAL"
            })
            continue # Skip placeholder check if empty

        # Placeholder Check
        if placeholder_pattern.search(command):
            errors.append({
                "nodeId": node_id,
                "message": "Command contains unreplaced placeholders",
                "level": "CRITICAL"
            })

    # --- Return Logic ---
    critical_errors = [e for e in errors if e['level'] == 'CRITICAL']

    if critical_errors:
        raise HTTPException(status_code=400, detail=errors)
    
    return True
