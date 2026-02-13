from abc import ABC, abstractmethod
from typing import Dict, List, Literal, TypedDict, Any, Optional

class ValidationResult(TypedDict):
    valid: bool
    errors: List[Dict[str, Any]]  # keys: nodeId, message, level

class RuntimeContext(TypedDict):
    # dynamic context passed during execution (e.g. websocket, db connection)
    system_fingerprint: Dict[str, Any]
    thread_id: str
    emit_event: Optional[Any] # Callable[[str, Dict], Awaitable[None]]
    state: Dict[str, Any]
    
class FlowXNode(ABC):
    """
    Abstract Base Class for all FlowX nodes.
    Enforces the strategy pattern for validation and execution.
    """
    
    def __init__(self, data: Dict[str, Any]):
        self.data = data

    @abstractmethod
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        """
        Pure function to validate node configuration.
        Returns critical errors or warnings.
        """
        pass
    
    @abstractmethod
    async def execute(self, context: RuntimeContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        The logic to run when LangGraph triggers this node.
        """
        pass
    
    @abstractmethod
    def get_execution_mode(self) -> Dict[str, bool]:
        """
        Returns metadata about execution requirements.
        e.g. {'requires_pty': True, 'is_interactive': False}
        """
        pass
