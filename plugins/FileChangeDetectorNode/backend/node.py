from typing import Dict, Any
import asyncio
import re
from engine.protocol import FlowXNode, ValidationResult
from engine.watcher import file_watch_manager

# Basic variable interpolation matching {{inputs.node_id.field}}
VARIABLE_PATTERN = re.compile(r"\{\{([^}]+)\}\}")

class FileChangeDetectorNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        errors = []
        node_id = data.get("id")
        node_data = data.get("data", {})
        
        watch_path = node_data.get("watch_path", "")
        event_mask = node_data.get("event_mask", [])
        
        if not watch_path or not watch_path.strip():
            errors.append({
                "nodeId": node_id,
                "message": "Watch path is empty.",
                "level": "CRITICAL"
            })
            
        if not event_mask:
            errors.append({
                "nodeId": node_id,
                "message": "At least one event type (created, modified, deleted) must be selected.",
                "level": "CRITICAL"
            })

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    def get_wait_strategy(self) -> str:
        # Crucial: Wait for ALL parents so variables from upstream are fully resolved
        return "ALL"
        
    def _interpolate_path(self, path: str, inputs: Dict[str, Any]) -> str:
        """
        Replaces {{inputs.node_id.field}} with actual data from execution context.
        """
        def replace_match(match):
            var_path = match.group(1).split(".") # e.g. ["inputs", "start", "path"]
            
            # Simple path traversal in results
            if len(var_path) >= 3 and var_path[0] == "inputs":
                target_node_id = var_path[1]
                target_field = ".".join(var_path[2:])
                
                # Check if target node ID exists in inputs payload
                if target_node_id in inputs:
                    # Extract nested field if dots exist
                    current_data = inputs[target_node_id].get("output", {})
                    
                    fields = target_field.split('.')
                    for field in fields:
                        if isinstance(current_data, dict):
                            current_data = current_data.get(field, "")
                        else:
                            return str(current_data)
                            
                    return str(current_data)
            return match.group(0) # Unresolved

        return VARIABLE_PATTERN.sub(replace_match, path)

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        # self.data IS the flat data dict (runner passes node['data'] directly)
        # so we read fields directly, not via .get('data', {})
        node_data = self.data
        raw_path = node_data.get("watch_path", "")
        event_mask = node_data.get("event_mask", ["created", "modified", "deleted"])
        recursive = node_data.get("recursive", False)
        
        print(f"[FileChangeDetector] execute() called. raw_path='{raw_path}', event_mask={event_mask}, recursive={recursive}", flush=True)
        
        # UI string payload parsing -> int
        try:
            timeout_val = float(node_data.get("timeout", 0))
        except (ValueError, TypeError):
            timeout_val = 0
            
        effective_timeout = None if timeout_val == 0 else float(timeout_val)
        inputs_data = payload.get("inputs", {})
        
        # 1. Resolution
        resolved_path = self._interpolate_path(raw_path, inputs_data)
        
        # Provide fallback emit logger if available
        emit = ctx.get("context", {}).get("emit_event")
        node_id = self.data.get("id", "unknown")
        
        if emit:
            await emit("node_log", {
                "nodeId": node_id, 
                "log": f"\r\n\x1b[36m> Monitoring path: '{resolved_path}'\r\n  Events: {', '.join(event_mask)} | Recursive: {recursive} | Timeout: {'∞' if effective_timeout is None else f'{effective_timeout}s'}\x1b[0m\r\n", 
                "type": "stdout"
            })
        import logging
        logging.getLogger(__name__).info(f"[FileChangeDetector] Registering watch: path='{resolved_path}', mask={event_mask}, recursive={recursive}")
            
        # 2. Suspension setup
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        
        # 3. Registration
        try:
            file_watch_manager.register_watch(
                path=resolved_path,
                loop=loop,
                future=future,
                event_mask=event_mask,
                recursive=recursive
            )
        except ValueError as e:
            # Path doesn't exist
            return {
                "status": "failed",
                "output": {
                    "error": str(e),
                    "path": resolved_path,
                    "event": "none"
                }
            }
            
        # 4. The Yield
        try:
            if effective_timeout is not None:
                event_data = await asyncio.wait_for(future, timeout=effective_timeout)
            else:
                # No timeout or 0 bypasses wrapper and awaits indefinitely
                event_data = await future
                
            return {
                "status": "success",
                "output": {
                    "file_path": event_data["path"],
                    "event": event_data["event"]
                }
            }
            
        except asyncio.TimeoutError:
            err_msg = f"Timed out after {timeout_val} seconds waiting for {event_mask} in {resolved_path}"
            if emit:
                await emit("node_log", {
                    "nodeId": node_id, 
                    "log": f"\r\n\x1b[31m{err_msg}\x1b[0m\r\n", 
                    "type": "stderr"
                })
            return {
                "status": "failed",
                "output": {
                    "error": "Timeout reached",
                    "path": resolved_path,
                    "event": "timeout"
                }
            }
        except asyncio.CancelledError:
             return {
                "status": "failed",
                "output": {
                    "error": "Workflow Cancelled",
                    "path": resolved_path,
                    "event": "cancelled"
                }
            }
        finally:
            # Prevent zombie watches
            file_watch_manager.unregister_watch(path=resolved_path, future=future)

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": False,
            "is_interactive": False 
        }
