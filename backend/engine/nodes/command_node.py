from typing import Dict, Any, List
import re
from ..protocol import FlowXNode, ValidationResult, RuntimeContext

class CommandNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        errors = []
        node_id = data.get("id")
        node_data = data.get("data", {})
        command = node_data.get("command", "")

        # Empty Check
        if not command or not command.strip():
            errors.append({
                "nodeId": node_id,
                "message": "Command is empty",
                "level": "CRITICAL"
            })
        
        # Placeholder Check (Regex for <...>)
        placeholder_pattern = re.compile(r"<[^>]+>")
        if command and placeholder_pattern.search(command):
            errors.append({
                "nodeId": node_id,
                "message": "Command contains unreplaced placeholders",
                "level": "CRITICAL"
            })

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    async def execute(self, context: RuntimeContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Execution logic will be migrated here later (LangGraph integration phase)
        # For now, this is a placeholder to satisfy the protocol
        return {"status": "executed", "command": payload.get("command")}

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": True,
            "is_interactive": True 
        }
