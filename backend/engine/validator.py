from typing import List, Dict, Any, Set
from collections import deque
from fastapi import HTTPException

# Registry & Protocol
from .registry import NodeRegistry
from nodes.start.node import StartNode
from nodes.command.node import CommandNode

# Register Nodes
NodeRegistry.register("startNode", StartNode)
NodeRegistry.register("commandNode", CommandNode)

def validate_graph(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    Tier 2 Graph Compiler:
    1. Reachability Analysis (BFS from StartNode).
    2. Parallel Validation of REACHABLE nodes only.
    3. Output Aggregation (NodeID -> Status).
    
    Status: 'READY' | 'VALIDATION_FAILED'
    """
    validation_map: Dict[str, str] = {}
    
    # --- 1. Identify Start Node ---
    start_nodes = [n for n in nodes if n.get('type') == 'startNode']
    if not start_nodes:
        raise HTTPException(status_code=400, detail=[{"nodeId": "global", "message": "No Start Node found", "level": "CRITICAL"}])
    if len(start_nodes) > 1:
        raise HTTPException(status_code=400, detail=[{"nodeId": "global", "message": "Multiple Start Nodes found", "level": "CRITICAL"}])
    
    start_node = start_nodes[0]
    start_id = start_node['id']
    
    # --- 2. Reachability Analysis (BFS) ---
    # Build Adjacency List
    adj_list: Dict[str, List[str]] = {n['id']: [] for n in nodes}
    for edge in edges:
        src = edge.get('source')
        trg = edge.get('target')
        if src in adj_list and trg in adj_list:
            adj_list[src].append(trg)
            
    # BFS
    reachable_ids: Set[str] = set()
    queue = deque([start_id])
    reachable_ids.add(start_id)
    
    while queue:
        curr = queue.popleft()
        for neighbor in adj_list[curr]:
            if neighbor not in reachable_ids:
                reachable_ids.add(neighbor)
                queue.append(neighbor)
                
    # --- 3. Selective Validation ---
    node_map = {n['id']: n for n in nodes}
    errors = []
    
    for node_id in reachable_ids:
        node = node_map[node_id]
        node_type = node.get('type')
        
        try:
            node_class = NodeRegistry.get_node(node_type)
            strategy = node_class(node)
            result = strategy.validate(node)
            
            if result['valid']:
                validation_map[node_id] = "READY"
            else:
                validation_map[node_id] = "VALIDATION_FAILED"
                # Collect errors for the legacy strict check or detailed feedback
                errors.extend(result['errors'])
                
        except ValueError:
            # Unknown node type - treat as failed or specialized state
            validation_map[node_id] = "VALIDATION_FAILED"
            errors.append({"nodeId": node_id, "message": f"Unknown node type: {node_type}", "level": "CRITICAL"})
        except Exception as e:
            validation_map[node_id] = "VALIDATION_FAILED"
            errors.append({"nodeId": node_id, "message": str(e), "level": "CRITICAL"})

    # --- 4. Handle Aggregated Critical Errors (Gatekeeper) ---
    # If this function is called for strict validation (like /start), 
    # we might want to raise here. But for /validate endpoint, we want to return the map.
    # We will split this usage. 
    
    # For now, if errors exist, we still return the map, but the CALLER decides if it's a stop.
    # However, validate_workflow (legacy) expects boolean or raise.
    
    return validation_map, errors

def validate_workflow(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> bool:
    """
    Legacy Wrapper: Enforces strict validation for Execution.
    Raises HTTPException if ANY critical error exists in Reachable nodes.
    """
    _, errors = validate_graph(nodes, edges)
    
    critical_errors = [e for e in errors if e.get('level') == 'CRITICAL']
    if critical_errors:
        raise HTTPException(status_code=400, detail=critical_errors)
        
    return True
