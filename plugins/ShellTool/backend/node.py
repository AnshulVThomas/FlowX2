from typing import Dict, Any
from engine.protocol import FlowXNode, ValidationResult
# Import schemas from the Agent's registry
from plugins.ReActAgent.backend.tools import TOOL_SCHEMAS 

class ShellToolNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        # The payload IS the permission grant
        return {
            "status": "success",
            "output": {
                "type": "TOOL_DEF",
                "definition": TOOL_SCHEMAS["run_shell"]
            }
        }
        
    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
