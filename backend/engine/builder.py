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
                    # EMIT STATUS: RUNNING
                    if emit_event:
                        await emit_event("node_status", {
                            "nodeId": _node_id,
                            "status": "running"
                        })

                    import datetime
                    start_time = datetime.datetime.now().strftime("%H:%M:%S")
                    cmd_str = _node_data.get('command', 'No Command')
                    print(f"[{start_time}] ⚡ Running Node {_node_id}: {cmd_str}")

                    result = await instance.execute(execution_state, _node_data)
                    # print(f"--- [GraphBuilder] Node {_node_id} COMPLETED. Status: {result.get('status')} ---")
                    
                    # EMIT STATUS: COMPLETED/FAILED
                    if emit_event:
                        await emit_event("node_status", {
                            "nodeId": _node_id,
                            "status": "completed" if result.get("status") == "success" else "failed"
                        })

                    # Log result
                    log_entry = {
                        "nodeId": _node_id, # FIX: camelCase matches frontend
                        "timestamp": "iso-time-placeholder", # TODO: Real time
                        "message": result.get("stdout", "") or str(result)
                    }
                    
                    # Update state (Merge semantics)
                    # Used to read 'results' from state, update it, return it.
                    # optimized: now we just return the delta and let the reducer merge it.
                    
                    node_result = {
                        _node_id: {
                            "status": result.get("status", "unknown"),
                            "exit_code": result.get("exit_code"),
                            "timestamp": "iso-time-placeholder"
                        }
                    }

                    return {
                        "logs": [log_entry],
                        "execution_status": "RUNNING",
                        "results": node_result
                    }
                        
                except Exception as e:
                    # Check if it's a NodeInterrupt (from sudo)
                    # We must re-raise it so LangGraph can handle the suspension/checkpointing.
                    if type(e).__name__ == "NodeInterrupt":
                        print(f"!!! [GraphBuilder] Node {_node_id} INTERRUPTED: {e} !!!")
                        
                        # EMIT STATUS: ATTENTION_REQUIRED
                        if emit_event:
                            await emit_event("interrupt", {
                                "nodeId": _node_id,
                                "thread_id": config.get("configurable", {}).get("thread_id", "unknown"),
                                "reason": str(e)
                            })
                            
                        raise e
                        
                    print(f"!!! [GraphBuilder] Node {_node_id} FAILED: {e} !!!")
                    
                    # EMIT STATUS: FAILED
                    if emit_event:
                        await emit_event("node_status", {
                            "nodeId": _node_id,
                            "status": "failed"
                        })

                    import traceback
                    traceback.print_exc()
                    return {
                        "execution_status": "FAILED",
                        "logs": [{"node_id": _node_id, "timestamp": "", "message": str(e)}]
                    }

            # Register with Graph
            graph.add_node(node_id, node_wrapper)

        # 2. Add Edges (Smart Conditional Routing)
        # Find Start Node to map START -> node_id
        start_node_id = None
        for node in nodes:
            if node["type"] == "startNode":
                start_node_id = node["id"]
                break
        
        if start_node_id:
            graph.add_edge(START, start_node_id)

        # Group edges by source to handle branching logic
        edges_by_source = {}
        for edge in edges:
            src = edge["source"]
            if src not in edges_by_source:
                edges_by_source[src] = []
            edges_by_source[src].append(edge)

        for source_id, source_edges in edges_by_source.items():
            # Pre-calculate targets for this source
            all_targets = [e["target"] for e in source_edges]
            conditional_targets = [e["target"] for e in source_edges if e.get("data", {}).get("behavior", "conditional") == "conditional"]
            force_targets = [e["target"] for e in source_edges if e.get("data", {}).get("behavior") == "force"]
            failure_targets = [e["target"] for e in source_edges if e.get("data", {}).get("behavior") == "failure"]

            # Define Router Function (Closure captures specific targets)
            def smart_router(state: FlowState, _src=source_id, _cond=conditional_targets, _force=force_targets, _fail=failure_targets):
                results = state.get("results", {})
                source_result = results.get(_src)

                # Default to conditional flow if no result
                if not source_result:
                    return _cond + _force
                
                status = source_result.get("status")
                
                # BRANCHING LOGIC:
                # 1. Success -> Run Conditional + Force (Skip Failure)
                # 2. Failed -> Run Force + Failure (Skip Conditional)
                if status == "success":
                    return _cond + _force
                else:
                    return _force + _fail

            # Register conditional edges
            graph.add_conditional_edges(
                source_id,
                smart_router,
                path_map={t: t for t in all_targets} # Valid next steps
            )

        # 3. Compile
        return graph.compile(checkpointer=self.checkpointer, interrupt_before=[])
