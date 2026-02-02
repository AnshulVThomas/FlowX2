from typing import Dict, Any, List
from ..protocol import FlowXNode, ValidationResult, RuntimeContext

class StartNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        # StartNode itself usually doesn't have complex internal config
        # But we can validate if it has a name
        errors = []
        # Checks are minimal for Start Node
        return {"valid": True, "errors": []}

    async def execute(self, context: RuntimeContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Start Node just passes through the initial state or input
        # It initiates the workflow flow.
        return {"status": "success", "output": "Workflow Started"}

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": False,
            "is_interactive": False
        }
