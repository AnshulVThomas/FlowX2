from typing import Dict, Any
from engine.protocol import FlowXNode, ValidationResult

class ORMergeNode(FlowXNode):
    """
    OR Merge (Discriminator) Node.
    Fires on the first incoming branch to arrive with valid data.
    """

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pass-through execution.
        The engine has already guaranteed that 'inputs' contains the data 
        from the winning branch.
        """
        inputs = payload.get("inputs", {})
        
        winner_id = "unknown"
        winner_data = {}
        
        # Grab the first valid payload from the inbox
        # Since the engine filters skips and checks "ANY", this is the winner.
        if inputs:
            winner_id = next(iter(inputs))
            winner_data = inputs[winner_id]

        # Return SUCCESS to allow downstream conditional edges to function.
        # We wrap the original data (including potential errors) in 'output'.
        return {
            "status": "success", 
            "output": winner_data,
            "_merged_from": winner_id 
        }

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": False,
            "is_interactive": False,
        }

    def get_wait_strategy(self) -> str:
        # This tells the engine: "Run me as soon as ONE valid input arrives!"
        return "ANY"
