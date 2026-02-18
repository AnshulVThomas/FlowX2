import asyncio
import sys
import os
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure backend path
sys.path.append(os.getcwd())
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))

try:
    from backend.engine.async_runner import AsyncGraphExecutor
    from backend.engine.registry import NodeRegistry
except ImportError:
    from engine.async_runner import AsyncGraphExecutor
    from engine.registry import NodeRegistry

# Mock Node that uses SudoLock
class MockCommandNode:
    def __init__(self, data):
        self.data = data
        
    async def execute(self, ctx, payload):
        try:
            from backend.plugins.CommandNode.backend.node import CommandNode
        except ImportError:
            try:
                from plugins.CommandNode.backend.node import CommandNode
            except ImportError:
                from nodes.command.node import CommandNode
             
        node = CommandNode(self.data)
        return await node.execute(ctx, payload)

async def test_pty_execution_with_sudo():
    print("TEST: PTY Execution with Sudo Lock")
    
    # Mock execute_in_pty to simulate a successful sudo command
    with patch("engine.pty_runner.execute_in_pty") as mock_pty:
        mock_pty.return_value = (0, "Update complete\n", "")
        
        # Workflow with a sudo-locked node
        workflow = {
            "id": "test_sudo_pty",
            "nodes": [
                {
                    "id": "SECURE_NODE", 
                    "type": "commandNode", 
                    "data": {
                        "command": "sudo apt update", 
                        "sudoLock": True
                    }
                }
            ],
            "edges": []
        }
        
        NodeRegistry.register("commandNode", MockCommandNode)
        global_context = {"sudo_password": "secret"}
        
        executor = AsyncGraphExecutor(workflow, global_context=global_context)
        result = await executor.execute()
        
        # Verify result
        assert result["results"]["SECURE_NODE"]["status"] == "success", f"Expected success, got: {result}"
        
        # Verify execute_in_pty was called with the password
        mock_pty.assert_called_once()
        call_kwargs = mock_pty.call_args
        assert call_kwargs.kwargs.get("sudo_password") == "secret" or \
               (len(call_kwargs.args) > 1 and call_kwargs.args[1] == "secret"), \
               f"Password not passed to PTY: {call_kwargs}"
        
    print("PASS: PTY Execution with Sudo Lock")

async def test_pty_execution_wrong_password():
    print("\nTEST: PTY Execution with Wrong Password")
    
    with patch("engine.pty_runner.execute_in_pty") as mock_pty:
        # Simulate wrong password: exit_code=1, stderr has error
        mock_pty.return_value = (1, "", "[FlowX Error] Incorrect sudo password.\n")
        
        workflow = {
            "id": "test_wrong_pass",
            "nodes": [
                {
                    "id": "BAD_NODE", 
                    "type": "commandNode", 
                    "data": {
                        "command": "sudo apt update", 
                        "sudoLock": True
                    }
                }
            ],
            "edges": []
        }
        
        NodeRegistry.register("commandNode", MockCommandNode)
        global_context = {"sudo_password": "wrong_password"}
        
        executor = AsyncGraphExecutor(workflow, global_context=global_context)
        result = await executor.execute()
        
        assert result["results"]["BAD_NODE"]["status"] == "error", f"Expected error, got: {result}"
        
    print("PASS: PTY Execution with Wrong Password")

async def test_crash_recovery():
    print("\nTEST: Crash Recovery (Initial State)")
    
    workflow = {
        "id": "test_crash",
        "nodes": [
            {"id": "DONE_NODE", "type": "commandNode", "data": {"command": "echo done"}},
            {"id": "PENDING_NODE", "type": "commandNode", "data": {"command": "echo pending"}}
        ],
        "edges": [{"source": "DONE_NODE", "target": "PENDING_NODE"}]
    }
    
    # Simulate DB State: DONE_NODE is already successful
    initial_state = {
        "DONE_NODE": {"status": "success", "stdout": "already done"}
    }
    
    with patch("engine.pty_runner.execute_in_pty") as mock_pty:
        mock_pty.return_value = (0, "pending\n", "")
        
        executor = AsyncGraphExecutor(workflow, initial_state=initial_state)
        
        # Check if DONE_NODE future is already set
        assert executor.futures["DONE_NODE"].done()
        assert executor.futures["DONE_NODE"].result()["stdout"] == "already done"
        
        result = await executor.execute()
        
        # Verify PENDING_NODE ran
        assert result["results"]["PENDING_NODE"]["status"] == "success"
        
        # Verify PTY only called once (for pending node)
        assert mock_pty.call_count == 1
        
    print("PASS: Crash Recovery")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(test_pty_execution_with_sudo())
        loop.run_until_complete(test_pty_execution_wrong_password())
        loop.run_until_complete(test_crash_recovery())
    finally:
        loop.close()
