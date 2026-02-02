from typing import Dict, Type
from .protocol import FlowXNode

class NodeRegistry:
    _instance = None
    _nodes: Dict[str, Type[FlowXNode]] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(NodeRegistry, cls).__new__(cls)
        return cls._instance

    @classmethod
    def register(cls, node_type: str, node_class: Type[FlowXNode]):
        """
        Register a new node type strategy.
        """
        print(f"DEBUG: Registering node type '{node_type}' with class {node_class.__name__}")
        cls._nodes[node_type] = node_class

    @classmethod
    def get_node(cls, node_type: str) -> Type[FlowXNode]:
        """
        Retrieve the strategy class for a node type.
        """
        node_class = cls._nodes.get(node_type)
        if not node_class:
            # Fallback or strict error? 
            # For now, let's treat unknown nodes as a generic error or handle explicitly.
            # But the caller expects a class.
            raise ValueError(f"Unknown node type: {node_type}")
        return node_class

    @classmethod
    def list_nodes(cls):
        return list(cls._nodes.keys())
