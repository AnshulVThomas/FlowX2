from typing import TypedDict, Dict, Any, List, Optional, Literal

class LogEntry(TypedDict):
    node_id: str
    timestamp: str
    message: str

class FlowState(TypedDict):
    """
    Represents the state of a FlowX execution flow.
    Passed between LangGraph nodes.
    """
    context: Dict[str, Any]      # Variables shared across nodes
    logs: List[LogEntry]         # Structured logs for UI
    current_node_id: str
    execution_status: Literal["RUNNING", "PAUSED", "COMPLETED", "FAILED", "ATTENTION_REQUIRED"]
    
    # Human-in-the-Loop / Resume State
    sudo_password: Optional[str] # Injected state for Resume
    pending_interaction: Optional[str] # e.g. "SUDO_PASSWORD_REQUIRED"
