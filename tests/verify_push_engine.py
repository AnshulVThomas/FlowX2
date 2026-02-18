
import sys
import asyncio
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

# Mock database before importing engine
sys.modules["database.connection"] = MagicMock()
sys.modules["database.connection"].db = MagicMock()

from backend.engine.async_runner import AsyncGraphExecutor
from backend.engine.registry import NodeRegistry
from plugins.CommandNode.backend.node import CommandNode
from plugins.ORMergeNode.backend.node import ORMergeNode
from engine.protocol import FlowXNode, ValidationResult

# Mock StartNode since we don't want to rely on its implementation
class StartNode(FlowXNode):
    def validate(self, data): return {"valid": True, "errors": []}
    async def execute(self, ctx, payload):
        return {"status": "success", "output": {"data": "start"}}
    def get_execution_mode(self): return {}

# Register nodes manually for the test
NodeRegistry.register("startNode", StartNode)
NodeRegistry.register("commandNode", CommandNode)
NodeRegistry.register("orMergeNode", ORMergeNode)

async def test_push_engine():
    print("--- Starting Push Engine Verification ---")
    
    # Graph Structure:
    # Start -> Cmd1 (Success) -> Merge
    # Start -> Cmd2 (Failure) -> Merge
    # Merge should fire with Cmd1's payload
    
    workflow_data = {
        "id": "test-workflow",
        "nodes": [
            {"id": "start", "type": "startNode", "data": {}},
            {"id": "cmd1", "type": "commandNode", "data": {"command": "echo 'winner'"}},
            {"id": "cmd2", "type": "commandNode", "data": {"command": "false"}}, # failures exit code 1
            {"id": "merge", "type": "orMergeNode", "data": {}}
        ],
        "edges": [
            {"source": "start", "target": "cmd1", "data": {"behavior": "conditional"}},
            {"source": "start", "target": "cmd2", "data": {"behavior": "conditional"}},
            {"source": "cmd1", "target": "merge", "data": {"behavior": "conditional"}},
            {"source": "cmd2", "target": "merge", "data": {"behavior": "conditional"}}
        ]
    }
    
    executor = AsyncGraphExecutor(workflow_data)
    
    # We need to mock emit_event to see logs, but it's optional
    executor.emit_event = AsyncMock()
    
    print("Executing workflow...")
    result = await executor.execute()
    
    print("\n--- Execution Results ---")
    print("Map:", executor.results)
    
    # Assertions
    cmd1_res = executor.results.get("cmd1")
    cmd2_res = executor.results.get("cmd2")
    merge_res = executor.results.get("merge")
    
    assert cmd1_res["status"] == "success", "Cmd1 should succeed"
    assert cmd2_res["status"] == "failed", f"Cmd2 should fail (exit code 1), got {cmd2_res['status']}"
    
    # Check Command Node Schema
    print("\nChecking Command Node Schema (Cmd1)...")
    output = cmd1_res.get("output", {})
    assert "command" in output, "Missing 'command' in output"
    assert "stdout" in output, "Missing 'stdout' in output"
    assert "stderr" in output, "Missing 'stderr' in output"
    assert "exit_code" in output, "Missing 'exit_code' in output"
    assert "duration_ms" in output, "Missing 'duration_ms' in output"
    assert isinstance(output["duration_ms"], int), "duration_ms should be an integer"
    assert output["stdout"] == "winner", f"Unexpected stdout: {output['stdout']}"
    print("✅ Command Node Schema Verified")
    
    # Check OR Merge Logic
    print("\nChecking OR Merge Logic...")
    if not merge_res:
        print("❌ OR Merge Node did not execute!")
        sys.exit(1)
        
    assert merge_res["status"] == "success", "Merge node should succeed"
    assert merge_res["_merged_from"] == "cmd1", f"Merge should pick 'cmd1', got {merge_res.get('_merged_from')}"
    
    # Check Logic regarding execution order/skips
    # The inbox for merge should contain 'cmd1': payload and 'cmd2': SKIP_BRANCH
    # But SKIP_BRANCH is an object, hard to check in results (it's not in results)
    # Check AsyncGraphExecutor inboxes state would require accessing internal state
    
    print(f"✅ OR Merge picked correct winner: {merge_res['_merged_from']}")
    
    print("\n--- All Tests Passed ---")

if __name__ == "__main__":
    asyncio.run(test_push_engine())
