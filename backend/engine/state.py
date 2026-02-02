import operator
from typing import TypedDict, Dict, Any, List, Optional, Literal, Annotated

def merge_dicts(a: Dict, b: Dict) -> Dict:
    return {**a, **b}

def take_last(a: Any, b: Any) -> Any:
    return b

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
    logs: Annotated[List[LogEntry], operator.add]         # Structured logs for UI
    current_node_id: str
    execution_status: Annotated[Literal["RUNNING", "PAUSED", "COMPLETED", "FAILED", "ATTENTION_REQUIRED"], take_last]
    
    # Human-in-the-Loop / Resume State
    sudo_password: Optional[str] # Injected state for Resume
    pending_interaction: Optional[str] # e.g. "SUDO_PASSWORD_REQUIRED"
    
    # Per-Node Results (Tier 3 Enhancements)
    results: Annotated[Dict[str, Any], merge_dicts] # node_id -> { status: 'success'|'error', exit_code: int, ... }
