from engine.protocol import FlowXNode

# --- THE FUNCTION ---
def stop_workflow_func(reason: str = "Stopped by Agent") -> str:
    """Stops the workflow immediately."""
    return f"__FLOWX_SIGNAL__STOP:{reason}"

# --- THE SCHEMA ---
SCHEMA = {
    "name": "stop_workflow",
    "description": "Permanently stops the workflow. Use when a critical, unrecoverable error occurs.",
    "parameters": "reason (string)"
}

class StopToolNode(FlowXNode):
    def validate(self, data): return {"valid": True, "errors": []}
    
    async def execute(self, ctx, payload):
        return {
            "status": "success",
            "output": {
                "type": "TOOL_DEF",
                "definition": SCHEMA,
                "implementation": stop_workflow_func
            }
        }
    
    def get_execution_mode(self): return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str: return "ALL"
