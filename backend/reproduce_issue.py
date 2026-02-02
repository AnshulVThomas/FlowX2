from engine.nodes.command_node import CommandNode
from engine.protocol import FlowXNode

try:
    print("Instantiating CommandNode...")
    node = CommandNode({"id": "test", "data": {"command": "echo hello"}})
    print("Success:", node.data)
except TypeError as e:
    print("Caught expected error:", e)
except Exception as e:
    print("Caught unexpected error:", e)
