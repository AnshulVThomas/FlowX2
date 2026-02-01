from typing import List, Dict, Any, TypedDict, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

class WorkflowState(TypedDict):
    node_results: Dict[str, Dict[str, Any]]  # Stores status and exit codes: {node_id: {"status": "pending", "exit_code": None/0/1}}
    active_nodes: List[str]  # For UI highlighting

def create_node_processor(node_id: str):
    """
    Factory that creates a processing function for a specific node.
    It marks the node as pending and updates the active list.
    """
    def processor(state: WorkflowState) -> Dict[str, Any]:
        # 1. Mark this specific node as "pending" execution
        # 2. Add itself to the "active_nodes" list for the UI
        # Note: We merge with existing state in LangGraph, so returning a dict updates explicitly.
        
        # We preserve existing results, just update this one
        current_results = state.get("node_results", {}).copy()
        current_results[node_id] = {"status": "pending", "exit_code": None}
        
        return {
            "node_results": current_results,
            "active_nodes": [node_id] 
        }
    return processor

def create_conditional_router(source_id: str, target_id: str):
    """
    Factory that creates a router function.
    Checks the exit code of the source node.
    """
    def router(state: WorkflowState) -> str:
        results = state.get("node_results", {})
        result = results.get(source_id, {})
        exit_code = result.get("exit_code")

        # If exit_code is 0, success -> move to target
        if exit_code == 0:
            return target_id
        
        # Any other code (None or >0) means stop/fail for this path
        # If it's None, it means it hasn't run yet, but this router runs AFTER the node.
        # Since we interrupt AFTER the node, the state should be updated externally to have an exit_code before resuming.
        return END
    return router

def compile_workflow(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Any:
    """
    Compiles the JSON workflow into a LangGraph executable.
    """
    workflow_builder = StateGraph(WorkflowState)
    command_node_ids = []

    # --- Add Nodes ---
    for node in nodes:
        node_id = node["id"]
        node_type = node.get("type")

        if node_type == "startNode":
            # Dummy pass-through for start
            workflow_builder.add_node(node_id, lambda state: {"active_nodes": [node_id]})
            workflow_builder.set_entry_point(node_id)
        
        elif node_type == "commandNode":
            workflow_builder.add_node(node_id, create_node_processor(node_id))
            command_node_ids.append(node_id)

    # --- Add Edges ---
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        
        # Only add edge if both nodes exist in the graph (Validation should have guaranteed this, but safety check)
        # Note: A smarter graph might handle multiple targets. 
        # For now, we assume simple 1:1 or N:1, but the router allows conditional logic.
        
        # We attach the conditional edge to the source
        workflow_builder.add_conditional_edges(
            source,
            create_conditional_router(source, target),
            # The mapping needs to map the return of router to actual node names.
            # Our router returns 'target_id' or END.
            # So we don't strictly one-to-one map if we return the node ID directly.
            # LangGraph allows returning the destination node name directly if map is not provided, 
            # BUT providing a map is safer and often required if dynamic strings are used.
            # However, for dynamic graphs, constructing the map {target_id: target_id, END: END} is best.
            {target: target, END: END}
        )

    # --- Compile ---
    checkpointer = MemorySaver()
    app = workflow_builder.compile(
        checkpointer=checkpointer,
        interrupt_after=command_node_ids
    )

    return app
