import asyncio
from typing import Dict, Any, List, Set, Optional
from datetime import datetime
from database.connection import db
from .registry import NodeRegistry

# Sentinel object for skipping branches
SKIP_BRANCH = object()

# Edge handles that are configuration-only (not execution flow)
CONFIG_HANDLES = {'api-handle', 'tool-handle'}
# Node types that are configuration-only and should not be executed
CONFIG_NODE_TYPES = {'apiConfig', 'toolCircle', 'vaultNode'}

class AsyncGraphExecutor:
    def __init__(self, workflow_data: dict, emit_event=None, thread_id: str = None, global_context: dict = None, initial_state: dict = None):
        self.workflow_id = workflow_data.get("id")
        all_nodes = workflow_data.get("nodes", [])
        all_edges = workflow_data.get("edges", [])
        self.emit_event = emit_event
        self.thread_id = thread_id
        self.global_context = global_context or {}
        
        # Filter out config-only edges and nodes
        self.edges = [e for e in all_edges if e.get("sourceHandle") not in CONFIG_HANDLES]
        self.nodes = [n for n in all_nodes if n.get("type") not in CONFIG_NODE_TYPES]
        
        # Global Results / Errors
        self.results = initial_state or {} 
        self.errors = []
        
        # Execution State
        self.futures: Dict[str, asyncio.Future] = {}
        self.node_map = {n["id"]: n for n in self.nodes}
        
        # Initialize futures for all nodes
        for node in self.nodes:
            self.futures[node["id"]] = asyncio.Future()
            
            # Crash Recovery: If node is already done, set result immediately
            if node["id"] in self.results:
                # We assume the result in DB is valid. 
                # If it was a failure, we might want to retry? 
                # Use Case: "Resume" usually means retry failed/pending. 
                # But here we accept 'initial_state' as "completed nodes".
                # If a node is in initial_state, we treat it as skipped/completed.
                val = self.results[node["id"]]
                # CAUTION: If val is a dict with 'status': 'failed', do we re-run?
                # For now, simplistic recovery: If it's in results, IT IS DONE.
                # The caller (resume endpoint) should filter out failed nodes from initial_state if they want retry.
                self.futures[node["id"]].set_result(val)

    def get_parents(self, node_id: str) -> List[str]:
        return [e["source"] for e in self.edges if e["target"] == node_id]

    async def _update_db_status(self, node_id: str, status: str, result: Any = None):
        """Fire-and-forget DB update"""
        if not self.thread_id:
            return

        try:
            # This should ideally be a background task to not block execution
            # dependent on the db driver async capabilities.
            # Assuming db.get_db() returns a motor/asyncio client
            database = db.get_db()
            
            update_data = {
                f"results.{node_id}": {
                    "status": status,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            }
            if result:
                 # Serialize if necessary, or store as is if JSON compatible
                 # Avoid storing bulky objects
                 if isinstance(result, (dict, list, str, int, float, bool, type(None))):
                    update_data[f"results.{node_id}"]["data"] = result
                 else:
                    update_data[f"results.{node_id}"]["data"] = str(result)

            await database.runs.update_one(
                {"thread_id": self.thread_id},
                {"$set": update_data},
                upsert=True
            )
        except Exception as e:
            print(f"DB Update Failed for {node_id}: {e}")

    async def _run_node(self, node: dict):
        node_id = node["id"]
        node_type = node["type"]
        node_data = node.get("data", {})
        
        try:
            # 0. CHECK IF ALREADY DONE (Crash Recovery)
            if self.futures[node_id].done():
                return

            # 1. WAIT FOR PARENTS
            parent_ids = self.get_parents(node_id)
            inputs = {}
            
            if parent_ids:
                # Wait for all parents to resolve (success, fail, or skip)
                await asyncio.gather(*[self.futures[p] for p in parent_ids], return_exceptions=True)
                
                should_skip = False
                
                for p_id in parent_ids:
                    # Find the edge connecting Parent -> Me
                    edge = next((e for e in self.edges if e["source"] == p_id and e["target"] == node_id), None)
                    behavior = edge.get("data", {}).get("behavior", "conditional") if edge else "conditional"
                    
                    # Get Parent's Result/Status safely
                    res = self.futures[p_id].result() if not self.futures[p_id].exception() else self.futures[p_id].exception()
                    inputs[p_id] = res
                    
                    # If parent was skipped, this branch is dead. Propagate skip.
                    if res is SKIP_BRANCH:
                        should_skip = True
                        break
                    
                    # Extract status exactly as builder.py did
                    p_status = res.get("status") if isinstance(res, dict) else "failed"

                    # ---------------------------------------------------------
                    # REPLICATING builder.py 'smart_router' LOGIC
                    # ---------------------------------------------------------
                    if p_status == "success":
                        # Success -> Run Conditional + Force (Skip Failure)
                        if behavior == "failure":
                            should_skip = True
                            break
                    else:
                        # Failed -> Run Force + Failure (Skip Conditional)
                        if behavior == "conditional":
                            should_skip = True
                            break

                # Apply the Skip
                if should_skip:
                    self.futures[node_id].set_result(SKIP_BRANCH)
                    
                    # Emit "skipped" so the UI visually greys it out
                    if self.emit_event:
                        await self.emit_event("node_status", {"nodeId": node_id, "status": "skipped"})
                    return

            # 3. SETUP & EXECUTE
            print(f"[BACKEND] [{node_id}] Executing...")
            
            # Retrieve node strategy from registry
            node_class = NodeRegistry.get_node(node_type)
            if not node_class:
                raise ValueError(f"Unknown node type: {node_type}")
            
            # INJECT ID INTO DATA so the node knows its own ID for logging
            # (CommandNode relies on data.get('id') to tag logs)
            init_data = node_data.copy()
            init_data["id"] = node_id
            
            instance = node_class(init_data)
            
            # Notify Start
            if self.emit_event:
                await self.emit_event("node_status", {
                    "nodeId": node_id, "status": "running"
                })
            
            # Context
            # Expected structure by CommandNode: ctx.get("context", {}).get("emit_event")
            runtime_context = {
                "thread_id": self.thread_id,
                "emit_event": self.emit_event,
                "system_fingerprint": {} 
            }
            # Inject global context (e.g. sudo_password)
            runtime_context.update(self.global_context)
            
            # The 'state' dictionary passed to the node
            context = {
                "context": runtime_context,
                "state": {"results": self.results} 
            }
            
            # Execute
            # Note: We pass 'inputs' (parent results) separate from global state if needed
            # For now, following protocol: execute(context, payload)
            # We treat 'node_data' as payload, maybe merge inputs?
            # Existing nodes expect 'data' from init.
            # We can put inputs into context['state']['inputs'] or similar.
            
            execution_payload = node_data.copy()
            execution_payload["inputs"] = inputs
            
            result = await instance.execute(context, execution_payload)
            
            # 4. UNBLOCK CHILDREN with Result
            self.results[node_id] = result
            self.futures[node_id].set_result(result)
            
            # 5. EMIT SUCCESS & PERSIST
            status = "completed" if result.get("status") == "success" else "failed"
            print(f"[BACKEND] [{node_id}] Finished with status: {status}")
            if self.emit_event:
                await self.emit_event("node_status", {
                    "nodeId": node_id, "status": status
                })
            
            # Background DB update
            asyncio.create_task(self._update_db_status(node_id, status, result))

        except Exception as e:
            # --- ERROR HANDLING ---
            # print(f"[{node_id}] Failed: {e}")
            
            # 1. Record Error
            error_record = {"nodeId": node_id, "error": str(e)}
            self.errors.append(error_record)
            self.results[node_id] = {"status": "failed", "error": str(e)}
            
            # 2. Emit Error
            if self.emit_event:
                await self.emit_event("node_status", {
                    "nodeId": node_id, "status": "failed"
                })
                await self.emit_event("node_log", {
                    "nodeId": node_id, "log": str(e), "type": "stderr"
                })

            # 3. Persist Failure
            asyncio.create_task(self._update_db_status(node_id, "failed", str(e)))

            # 4. Fail Future (Propagate to children)
            self.futures[node_id].set_result(e) 

    async def execute(self):
        # Fire all nodes. The "await futures" logic inside _run_node handles the order.
        tasks = [self._run_node(node) for node in self.nodes]
        await asyncio.gather(*tasks)
        
        return {
            "results": self.results,
            "errors": self.errors,
            "status": "COMPLETED" if not self.errors else "FAILED" # Simple aggregation
        }
