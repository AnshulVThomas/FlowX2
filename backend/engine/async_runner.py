import asyncio
from typing import Dict, Any, List, Set, Optional
from datetime import datetime
from database.connection import db
from .registry import NodeRegistry

# Sentinel object for skipped branches
SKIP_BRANCH = object()

CONFIG_HANDLES = {'api-handle', 'tool-handle'}
CONFIG_NODE_TYPES = {'apiConfig', 'toolCircle', 'vaultNode'}

class AsyncGraphExecutor:
    def __init__(self, workflow_data: dict, emit_event=None, thread_id: str = None, global_context: dict = None, initial_state: dict = None):
        self.workflow_id = workflow_data.get("id")
        self.emit_event = emit_event
        self.thread_id = thread_id
        self.global_context = global_context or {}
        
        all_nodes = workflow_data.get("nodes", [])
        all_edges = workflow_data.get("edges", [])
        
        self.edges = [e for e in all_edges if e.get("sourceHandle") not in CONFIG_HANDLES]
        self.nodes = [n for n in all_nodes if n.get("type") not in CONFIG_NODE_TYPES]
        self.node_map = {n["id"]: n for n in self.nodes}
        
        self.results = initial_state or {} 
        self.errors = []
        
        # --- PUSH ENGINE STATE ---
        self.node_status = {n["id"]: "pending" for n in self.nodes}
        
        # The Inbox: node_id -> { parent_id: payload }
        self.node_inboxes: Dict[str, Dict[str, Any]] = {n["id"]: {} for n in self.nodes}

    def _get_outgoing_edges(self, node_id: str) -> List[dict]:
        return [e for e in self.edges if e["source"] == node_id]

    def _get_incoming_edges(self, node_id: str) -> List[dict]:
        return [e for e in self.edges if e["target"] == node_id]

    def _get_edge_behavior(self, source_id: str, target_id: str) -> str:
        """Robustly extracts the routing behavior from an edge."""
        edge = next((e for e in self.edges if e["source"] == source_id and e["target"] == target_id), None)
        if not edge: return "conditional"
        
        # 1. Check explicit data
        behavior = edge.get("data", {}).get("behavior")
        if behavior in ["conditional", "failure", "always"]: return behavior
            
        # 2. Check source handle ID
        handle = str(edge.get("sourceHandle", "")).lower()
        if "fail" in handle or "error" in handle: return "failure"
        if "always" in handle or "force" in handle or "fallback" in handle: return "always"
        
        return "conditional"

    async def _update_db_status(self, node_id: str, status: str, result: Any = None):
        """Fire-and-forget DB update"""
        if not self.thread_id: return
        try:
            database = db.get_db()
            update_data = {f"results.{node_id}": {"status": status, "timestamp": datetime.utcnow().isoformat()}}
            if result:
                 update_data[f"results.{node_id}"]["data"] = result if isinstance(result, (dict, list, str, int, float, bool, type(None))) else str(result)
            await database.runs.update_one({"thread_id": self.thread_id}, {"$set": update_data}, upsert=True)
        except Exception as e:
            print(f"DB Update Failed for {node_id}: {e}")

    # ==========================================
    # CORE PUSH ENGINE LOGIC
    # ==========================================

    async def execute(self):
        """Forward-Traversal Execution Loop."""
        ALLOWED_TRIGGERS = {"startNode", "webhookNode", "cronNode"}
        
        # 1. Identify Start Nodes (No incoming edges + Allowed Type)
        start_nodes = [
            n for n in self.nodes 
            if n.get("type") in ALLOWED_TRIGGERS and not self._get_incoming_edges(n["id"])
        ]

        if not start_nodes:
            return {"results": self.results, "errors": [{"error": "No valid start node found."}], "status": "FAILED"}

        active_tasks = set()

        # 2. Kick off the start nodes
        for node in start_nodes:
            self.node_status[node["id"]] = "running"
            task = asyncio.create_task(self._execute_plugin(node, inputs={}))
            active_tasks.add(task)

        # 3. The Event Loop
        while active_tasks:
            done, pending = await asyncio.wait(active_tasks, return_when=asyncio.FIRST_COMPLETED)
            active_tasks = pending

            for task in done:
                node_id, result_payload, is_skip = task.result()
                
                # 4. Push data to children
                outgoing_edges = self._get_outgoing_edges(node_id)
                for edge in outgoing_edges:
                    target_id = edge["target"]
                    if target_id not in self.node_map: continue
                    
                    target_node = self.node_map[target_id]
                    
                    # Evaluate Edge Conditions
                    behavior = self._get_edge_behavior(node_id, target_id)
                    passes_edge = False
                    
                    if not is_skip:
                        status = result_payload.get("status", "failed") if isinstance(result_payload, dict) else "failed"
                        if status == "success" and behavior != "failure": passes_edge = True
                        if status != "success" and behavior != "conditional": passes_edge = True

                    # 5. FILL THE INBOX (The Push)
                    payload_to_send = result_payload if passes_edge else SKIP_BRANCH
                    self.node_inboxes[target_id][node_id] = payload_to_send

                    # 6. Check if child is ready to run
                    if self._check_if_ready(target_node):
                        self.node_status[target_id] = "running"
                        
                        # Grab the inbox and schedule the child
                        child_inputs = self.node_inboxes[target_id].copy()
                        new_task = asyncio.create_task(self._execute_plugin(target_node, child_inputs))
                        active_tasks.add(new_task)

        status = "FAILED" if self.errors else "COMPLETED"
        return {"results": self.results, "errors": self.errors, "status": status}

    def _check_if_ready(self, node: dict) -> bool:
        """Determines if a node should run based on its Inbox and Wait Strategy."""
        node_id = node["id"]
        if self.node_status[node_id] != "pending":
            return False 

        incoming_edges = self._get_incoming_edges(node_id)
        inbox = self.node_inboxes[node_id]

        # Read Wait Strategy from Plugin Class
        node_class = NodeRegistry.get_node(node["type"])
        instance = node_class(node.get("data", {}))
        strategy = instance.get_wait_strategy()

        if strategy == "ANY":
            # OR MERGE: Run if ANY parent sent a valid payload
            for payload in inbox.values():
                if payload is not SKIP_BRANCH:
                    return True
            # If ALL parents skipped, we must run (to skip ourselves)
            if len(inbox) == len(incoming_edges):
                return True
            return False

        else: 
            # AND JOIN (Standard): Wait for ALL parents
            return len(inbox) == len(incoming_edges)

    async def _execute_plugin(self, node: dict, inputs: dict):
        """Executes the plugin with the filtered inputs."""
        node_id = node["id"]
        node_data = node.get("data", {})
        
        # 1. Check for total skip (All inputs are SKIP_BRANCH)
        # Note: If inputs is empty (start node), we treat it as valid run.
        if inputs and all(v is SKIP_BRANCH for v in inputs.values()):
            self.node_status[node_id] = "skipped"
            if self.emit_event:
                await self.emit_event("node_status", {"nodeId": node_id, "status": "skipped"})
            return (node_id, SKIP_BRANCH, True)

        try:
            print(f"[BACKEND] [{node_id}] Executing...")
            if self.emit_event:
                await self.emit_event("node_status", {"nodeId": node_id, "status": "running"})

            node_class = NodeRegistry.get_node(node["type"])
            init_data = node_data.copy()
            init_data["id"] = node_id
            instance = node_class(init_data)

            # Context Setup
            runtime_context = {"thread_id": self.thread_id, "emit_event": self.emit_event, "system_fingerprint": {}}
            runtime_context.update(self.global_context)
            context = {"context": runtime_context, "state": {"results": self.results}}
            
            # 2. FILTER INPUTS
            # Pass only valid data to the node. Remove SKIP_BRANCH tokens.
            clean_inputs = {k: v for k, v in inputs.items() if v is not SKIP_BRANCH}
            
            execution_payload = node_data.copy()
            execution_payload["inputs"] = clean_inputs # <--- The Inbox is passed here!

            # Run Plugin
            result = await instance.execute(context, execution_payload)

            # 3. Handle Result
            self.results[node_id] = result
            self.node_status[node_id] = "completed"
            
            status_str = "completed" if result.get("status") == "success" else "failed"
            print(f"[BACKEND] [{node_id}] Finished with status: {status_str}")
            
            if self.emit_event:
                await self.emit_event("node_status", {"nodeId": node_id, "status": status_str})
            asyncio.create_task(self._update_db_status(node_id, status_str, result))

            return (node_id, result, False)

        except Exception as e:
            # Error Handling
            self.errors.append({"nodeId": node_id, "error": str(e)})
            self.results[node_id] = {"status": "failed", "error": str(e)}
            self.node_status[node_id] = "failed"
            
            if self.emit_event:
                await self.emit_event("node_status", {"nodeId": node_id, "status": "failed"})
                await self.emit_event("node_log", {"nodeId": node_id, "log": str(e), "type": "stderr"})
            asyncio.create_task(self._update_db_status(node_id, "failed", str(e)))
            
            return (node_id, {"status": "failed", "error": str(e)}, False)
