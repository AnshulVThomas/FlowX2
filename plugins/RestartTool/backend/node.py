from engine.protocol import FlowXNode

# --- THE FUNCTION ---
def restart_workflow_func(args: str = "") -> str:
    """Restarts the workflow from the beginning."""
    print(f"[RESTART TOOL 🟠] Emitting Signal: RESTART")
    return "__FLOWX_SIGNAL__RESTART"

# --- THE SCHEMA ---
SCHEMA = {
    "name": "restart_workflow",
    "description": "Restarts the entire workflow. Use to retry after a temporary failure or state fix.",
    "parameters": "ignore (string)"
}

class RestartToolNode(FlowXNode):
    def validate(self, data): return {"valid": True, "errors": []}
    
    async def execute(self, ctx, payload):
        return {
            "status": "success",
            "output": {
                "type": "TOOL_DEF",
                "definition": SCHEMA,
                "implementation": restart_workflow_func
            }
        }
        
    def get_execution_mode(self): return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str: return "ALL"
