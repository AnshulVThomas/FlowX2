from typing import Dict, Any, List
from langgraph.graph import StateGraph, START, END
from .state import FlowState
from .registry import NodeRegistry

class GraphBuilder:
    def __init__(self, checkpointer=None):
        self.registry = NodeRegistry()
        self.checkpointer = checkpointer

    def build(self, workflow_data: Dict[str, Any]):
        """
        Converts a FlowX workflow dictionary into a compiled LangGraph runnable.
        """
        graph = StateGraph(FlowState)
        
        nodes = workflow_data.get("nodes", [])
        edges = workflow_data.get("edges", [])
        
        # 1. Add Nodes
        for node in nodes:
            node_id = node["id"]
            node_type = node["type"]
            node_data = node.get("data", {})
            
            # Get executable instance from registry
            flow_node = self.registry.get_node(node_type)
            if not flow_node:
                print(f"Warning: Unknown node type {node_type}")
                continue
                
            # Define the LangGraph node function wrapper
            # This captures specific node_data in the closure
            async def node_wrapper(state: FlowState, _node_id=node_id, _flow_node_cls=flow_node, _node_data=node_data):
                # Update current node ID in state
                state["current_node_id"] = _node_id
                
                # Instantiate logic strategy
                # FlowXNode base class now handles self.data = _node_data
                instance = _flow_node_cls(_node_data)
                
                # Execute logic (Protocol 'execute' method)
                try:
                    result = await instance.execute(state, _node_data)
                    
                    # Log result
                    log_entry = {
                        "node_id": _node_id,
                        "timestamp": "iso-time-placeholder", # TODO: Real time
                        "message": result.get("stdout", "") or str(result)
                    }
                    
                    # Update state (Merge semantics)
                    return {
                        "logs": [log_entry],
                        "execution_status": "RUNNING"
                    }
                except Exception as e:
                    # If it's a NodeInterrupt (from sudo), this block might not catch it 
                    # if LangGraph catches it first. Ideally we let it bubble up?
                    # But for generic errors:
                    return {
                        "execution_status": "FAILED",
                        "logs": [{"node_id": _node_id, "timestamp": "", "message": str(e)}]
                    }

            # Register with Graph
            graph.add_node(node_id, node_wrapper)

        # 2. Add Edges
        # Find Start Node to map START -> node_id
        start_node_id = None
        for node in nodes:
            if node["type"] == "startNode":
                start_node_id = node["id"]
                break
        
        if start_node_id:
            graph.add_edge(START, start_node_id)
            
        for edge in edges:
            source = edge["source"]
            target = edge["target"]
            graph.add_edge(source, target)

        # 3. Compile
        return graph.compile(checkpointer=self.checkpointer, interrupt_before=[])
