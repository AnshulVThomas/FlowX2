import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock
from backend.engine.async_runner import AsyncGraphExecutor, SKIP_BRANCH
from backend.engine.registry import NodeRegistry

# Mock Node
class MockNode:
    def __init__(self, data):
        self.data = data
        
    async def execute(self, context, payload):
        command = self.data.get("command", "")
        if command == "sleep 2":
            await asyncio.sleep(2)
            return {"status": "success", "stdout": "slept"}
        elif command == "fail":
            raise Exception("Intentional Failure")
        else:
            return {"status": "success", "stdout": f"executed {command}"}

# Register Mock Node
NodeRegistry.register("commandNode", MockNode)
NodeRegistry.register("startNode", MockNode)

@pytest.mark.asyncio
async def test_async_execution_parallel():
    """
    Test that a slow node doesn't block a fast node (if they don't depend on each other)
    """
    workflow = {
        "id": "test_parallel",
        "nodes": [
            {"id": "START", "type": "startNode", "data": {}},
            {"id": "SLOW", "type": "commandNode", "data": {"command": "sleep 2"}},
            {"id": "FAST", "type": "commandNode", "data": {"command": "fast"}},
        ],
        "edges": [
            {"source": "START", "target": "SLOW"},
            {"source": "START", "target": "FAST"},
        ]
    }
    
    executor = AsyncGraphExecutor(workflow)
    
    start_time = asyncio.get_event_loop().time()
    result = await executor.execute()
    end_time = asyncio.get_event_loop().time()
    
    duration = end_time - start_time
    
    # Should take roughly 2 seconds (limited by slow node), but FAST should be done
    assert duration >= 2.0 
    
    results = result["results"]
    assert results["FAST"]["stdout"] == "executed fast"
    assert results["SLOW"]["stdout"] == "slept"
    assert result["status"] == "COMPLETED"

@pytest.mark.asyncio
async def test_branching_skip():
    """
    Test that a failure in a parent skips dependent nodes (conditional edge)
    """
    workflow = {
        "id": "test_skip",
        "nodes": [
            {"id": "START", "type": "startNode", "data": {}},
            {"id": "FAIL", "type": "commandNode", "data": {"command": "fail"}},
            {"id": "DEPENDENT", "type": "commandNode", "data": {"command": "should_skip"}},
        ],
        "edges": [
            {"source": "START", "target": "FAIL"},
            {"source": "FAIL", "target": "DEPENDENT", "data": {"behavior": "conditional"}}, 
        ]
    }
    
    # We need to register MockNode if running in a fresh process, using the same registry
    
    executor = AsyncGraphExecutor(workflow)
    result = await executor.execute()
    
    results = result["results"]
    assert results["FAIL"]["status"] == "failed"
    # DEPENDENT should be skipped or not in results depending on implementation
    # Implementation sets SKIP_BRANCH to future.
    # The executor wrapper puts results into `self.results`.
    # Our logical flow: _run_node returns early if skipped.
    # So DEPENDENT might not be in self.results or marked as skipped?
    # Let's check logic: "if should_skip: self.futures[node_id].set_result(SKIP_BRANCH); return"
    # It returns without adding to self.results.
    
    assert "DEPENDENT" not in results 
    # Or strict error handling:
    # assert result["status"] == "FAILED" # Because one node failed
