import asyncio
from typing import Dict, Any, List, Set, Optional
from datetime import datetime
from database.connection import db
from .registry import NodeRegistry

# Sentinel object for skipping branches
SKIP_BRANCH = object()

class AsyncGraphExecutor:
    def __init__(self, workflow_data: dict, emit_event=None, thread_id: str = None, global_context: dict = None, initial_state: dict = None):
        self.workflow_id = workflow_data.get("id")
        self.nodes = workflow_data.get("nodes", [])
        self.edges = workflow_data.get("edges", [])
        self.emit_event = emit_event
        self.thread_id = thread_id
        self.global_context = global_context or {}
        
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
                # print(f"[{node_id}] Waiting for parents: {parent_ids}")
                # Wait for all parents to complete or fail
                await asyncio.gather(*[self.futures[p_id] for p_id in parent_ids])
            
                # 2. CHECK PARENT RESULTS & BRANCHING
                should_skip = False
                parent_failures = []
                
                for p_id in parent_ids:
                    try:
                        res = self.futures[p_id].result()
                        inputs[p_id] = res
                        
                        if res is SKIP_BRANCH:
                            should_skip = True
                        elif isinstance(res, Exception):
                            parent_failures.append(res)
                            
                    except asyncio.CancelledError:
                        should_skip = True
                    except Exception as e:
                        parent_failures.append(e)

                # BRANCHING LOGIC: Check edge behavior
                # If any incoming edge is 'conditional' and parent failed -> SKIP
                # If edge is 'force' -> Run anyway (unless parent was SKIP_BRANCH)
                
                # Simplified Logic for now: 
                # If any parent returns SKIP_BRANCH -> propagate SKIP_BRANCH
                if should_skip:
                    self.futures[node_id].set_result(SKIP_BRANCH)
                    return

                # If any parent failed, check if we have a 'force' edge from it
                if parent_failures:
                    # Logic: If ALL parents failed, and we don't have a specific 'failure' handler or 'force', skip.
                    # For this implementation, we'll assume strict dependency unless specified.
                    # If this node is NOT valid relationships -> Skip
                    # Simple rule: If any parent failed, we propagate failure/skip unless we are an Error Handler.
                    
                    # For now: Propagate exception if ANY parent failed
                    self.futures[node_id].set_result(parent_failures[0])
                    return

            # 3. SETUP & EXECUTE
            # print(f"[{node_id}] Executing...")
            
            # Retrieve node strategy from registry
            node_class = NodeRegistry.get_node(node_type)
            if not node_class:
                raise ValueError(f"Unknown node type: {node_type}")
                
            instance = node_class(node_data)
            
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
