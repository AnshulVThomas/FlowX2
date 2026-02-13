import pytest
from backend.engine.registry import NodeRegistry
from backend.engine.protocol import FlowXNode
from backend.engine.nodes.start_node import StartNode
from backend.engine.nodes.command_node import CommandNode
from backend.engine.validator import validate_workflow
from fastapi import HTTPException

# --- Registry Tests ---

def test_registry_registration():
    # Ensure standard nodes are registered (they are registered on import in validator.py)
    # We might need to manually trigger registration if not imported, 
    # but since we import validator below, they should be there.
    # Let's double check.
    
    # Manually register a mock to test mechanism
    class MockNode(FlowXNode):
        def validate(self, data): return {"valid": True, "errors": []}
        async def execute(self, ctx, payload): return {}
        def get_execution_mode(self): return {}

    NodeRegistry.register("mockNode", MockNode)
    assert NodeRegistry.get_node("mockNode") == MockNode
    assert "mockNode" in NodeRegistry.list_nodes()

def test_get_unknown_node():
    with pytest.raises(ValueError):
        NodeRegistry.get_node("nonExistentNode")

# --- Node Strategy Tests ---

def test_command_node_validation_success():
    node = CommandNode()
    valid_data = {"id": "cmd1", "data": {"command": "echo hello"}}
    result = node.validate(valid_data)
    assert result["valid"] is True
    assert len(result["errors"]) == 0

def test_command_node_validation_empty():
    node = CommandNode()
    invalid_data = {"id": "cmd1", "data": {"command": "   "}}
    result = node.validate(invalid_data)
    assert result["valid"] is False
    assert result["errors"][0]["message"] == "Command is empty"

def test_command_node_validation_placeholder():
    node = CommandNode()
    invalid_data = {"id": "cmd1", "data": {"command": "echo <USER>"}}
    result = node.validate(invalid_data)
    assert result["valid"] is False
    assert "unreplaced placeholders" in result["errors"][0]["message"]

# --- Workflow Integration Tests (Validator) ---

from backend.engine.validator import validate_workflow, validate_graph

# ... (Previous tests) ...

def test_validate_graph_reachability_and_status():
    """
    Tier 2 Verification:
    1. Start -> Command (Valid) => Both READY
    2. Orphan Command (Invalid) => Ignored (Not in map or not status FAILED)
    """
    nodes = [
        {"id": "start", "type": "startNode"},
        {"id": "cmd1", "type": "commandNode", "data": {"command": "echo hi"}},
        {"id": "orphan_bad", "type": "commandNode", "data": {"command": ""}} # Empty, Invalid
    ]
    edges = [
        {"source": "start", "target": "cmd1"}
    ]
    
    validation_map, errors = validate_graph(nodes, edges)
    
    # 1. Start and cmd1 should be READY
    assert validation_map.get("start") == "READY"
    assert validation_map.get("cmd1") == "READY"
    
    # 2. Orphan node should NOT be in validation_map (ignored)
    assert "orphan_bad" not in validation_map
    
    # 3. No critical errors should be reported for the orphan
    # (validate_graph returns errors for reachable nodes)
    assert len(errors) == 0

def test_validate_graph_failure_status():
    nodes = [
        {"id": "start", "type": "startNode"},
        {"id": "cmd_bad", "type": "commandNode", "data": {"command": ""}}
    ]
    edges = [
        {"source": "start", "target": "cmd_bad"}
    ]
    
    validation_map, errors = validate_graph(nodes, edges)
    
    assert validation_map.get("start") == "READY"
    assert validation_map.get("cmd_bad") == "VALIDATION_FAILED"
    assert len(errors) > 0
    assert errors[0]["nodeId"] == "cmd_bad"
