from typing import Dict, Any
from engine.protocol import FlowXNode, ValidationResult


class ORMergeNode(FlowXNode):
    """
    OR Merge (Discriminator) Node.
    
    Fires on the first incoming branch to complete successfully.
    All subsequent branches are silently discarded by the engine.
    The discriminator gating logic lives in AsyncGraphExecutor via
    the wait_strategy="ANY" contract.
    """

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        # No configuration to validate — this is a pure flow-control node
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pure pass-through. By the time execute() is called, the engine
        has already selected the valid winning branch.
        """
        inputs = payload.get("inputs", {})
        
        if inputs:
            source_node_id = next(iter(inputs))
            winner_data = inputs[source_node_id]
        else:
            source_node_id = "unknown"
            winner_data = {}
        
        # The node successfully routed the data, so its own status is "success".
        # This "cleans" the pipeline so standard conditional edges work downstream.
        # The next node can still read `output.status` to see the original result.
        return {
            "status": "success",
            "output": winner_data,
            "_merged_from": source_node_id,
        }

    def get_execution_mode(self) -> Dict[str, bool]:
        return {
            "requires_pty": False,
            "is_interactive": False,
        }

    def get_wait_strategy(self) -> str:
        return "ANY"
