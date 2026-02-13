from typing import Dict, Any
from engine.protocol import FlowXNode, ValidationResult

class VaultNode(FlowXNode):
    """
    The Vault node is purely for frontend configuration.
    It executes instantly and acts as a no-op on the backend.
    """
    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "status": "success",
            "message": "Vault configuration loaded."
        }

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        return {
            "valid": True, 
            "errors": []
        }

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": False, 
            "is_interactive": False 
        }
