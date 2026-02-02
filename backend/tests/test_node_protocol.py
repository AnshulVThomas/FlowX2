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

def test_validator_integration_valid():
    nodes = [
        {"id": "start", "type": "startNode"},
        {"id": "cmd1", "type": "commandNode", "data": {"command": "echo hi"}}
    ]
    edges = [
        {"source": "start", "target": "cmd1"}
    ]
    # Should return True
    assert validate_workflow(nodes, edges) is True

def test_validator_integration_invalid_command():
    nodes = [
        {"id": "start", "type": "startNode"},
        {"id": "cmd1", "type": "commandNode", "data": {"command": ""}} # Empty
    ]
    edges = [
        {"source": "start", "target": "cmd1"}
    ]
    
    with pytest.raises(HTTPException) as excinfo:
        validate_workflow(nodes, edges)
    
    assert excinfo.value.status_code == 400
    details = excinfo.value.detail
    assert any(d['message'] == "Command is empty" for d in details)

def test_validator_orphan_check():
    nodes = [
        {"id": "start", "type": "startNode"},
        {"id": "cmd1", "type": "commandNode", "data": {"command": "echo hi"}}
    ]
    edges = [] # No connection
    
    # Validator currently considers Orphan as WARNING, not CRITICAL exception
    # So it should NOT raise HTTPException, but internal errors list has warning.
    # The function returns True if no CRITICAL errors.
    
    assert validate_workflow(nodes, edges) is True
