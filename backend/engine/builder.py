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
            node_data["id"] = node_id  # Inject ID so node knows itself
            
            # Get executable instance from registry
            flow_node = self.registry.get_node(node_type)
            if not flow_node:
                print(f"Warning: Unknown node type {node_type}")
                continue
                
            # Define the LangGraph node function wrapper
            # This captures specific node_data in the closure
            from langchain_core.runnables import RunnableConfig
            
            async def node_wrapper(state: FlowState, config: RunnableConfig, _node_id=node_id, _flow_node_cls=flow_node, _node_data=node_data):
                # Update current node ID in state
                state["current_node_id"] = _node_id
                
                # Instantiate logic strategy
                # FlowXNode base class now handles self.data = _node_data
                instance = _flow_node_cls(_node_data)
                
                # 3. CONSTRUCT EPHEMERAL CONTEXT
                # We need to pass 'emit_event' to the node, but it cannot be in the persistent 'state'
                # because functions are not serializable by msgpack (MongoDB Checkpointer).
                # We create a shallow copy of the state and inject the ephemeral context.
                
                emit_event = config.get("configurable", {}).get("emit_event")
                
                # Copy persistent context and inject ephemeral services
                runtime_context_dict = state.get("context", {}).copy()
                if emit_event:
                    runtime_context_dict["emit_event"] = emit_event
                
                # Create the execution state (this is what the Node sees)
                execution_state = state.copy()
                execution_state["context"] = runtime_context_dict
                
                # Execute logic (Protocol 'execute' method)
                try:
                    print(f"--- [GraphBuilder] Executing Node: {_node_id} ---")
                    result = await instance.execute(execution_state, _node_data)
                    print(f"--- [GraphBuilder] Node {_node_id} COMPLETED. Status: {result.get('status')} ---")
                    
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
                    print(f"!!! [GraphBuilder] Node {_node_id} FAILED: {e} !!!")
                    # If it's a NodeInterrupt (from sudo), this block might not catch it 
                    # if LangGraph catches it first. Ideally we let it bubble up?
                    # But for generic errors:
                    import traceback
                    traceback.print_exc()
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
