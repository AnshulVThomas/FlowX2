import asyncio
import sys
import os
from unittest.mock import MagicMock, AsyncMock, patch
# import pytest # Removed

# Ensure backend path
sys.path.append(os.getcwd())
# Also try adding backend explicitly if running from root
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))

try:
    from backend.engine.async_runner import AsyncGraphExecutor
    from backend.engine.security import SudoKeepAlive
    from backend.engine.registry import NodeRegistry
except ImportError:
    # Try local import
    from engine.async_runner import AsyncGraphExecutor
    from engine.security import SudoKeepAlive
    from engine.registry import NodeRegistry

# Mock Node that uses SudoLock
class MockCommandNode:
    def __init__(self, data):
        self.data = data
        
    async def execute(self, ctx, payload):
        # reuse the logic we executed in actual node?
        # Or better, we import the actual CommandNode but mock subprocess
        try:
            from backend.nodes.command.node import CommandNode
        except ImportError:
             from nodes.command.node import CommandNode
             
        node = CommandNode(self.data)
        return await node.execute(ctx, payload)

async def test_sudo_keep_alive_lifecycle():
    print("TEST: SudoKeepAlive Lifecycle")
    
    with patch("asyncio.create_subprocess_shell") as mock_shell:
        # Mock process for sudo -S -v (Validation)
        mock_proc_validate = AsyncMock()
        mock_proc_validate.communicate.return_value = (b"", b"")
        mock_proc_validate.returncode = 0
        
        # Mock process for sudo -n -v (Refresh)
        mock_proc_refresh = AsyncMock()
        mock_proc_refresh.wait.return_value = None
        mock_proc_refresh.returncode = 0
        
        # Side effect to return different procs
        mock_shell.side_effect = [mock_proc_validate, mock_proc_refresh, mock_proc_refresh]
        
        async with SudoKeepAlive("fake_pass", interval=0.1) as ka:
            assert ka.keep_alive_task is not None
            await asyncio.sleep(0.2) # Let loop run once
            
        # Verify calls
        # 1. Validation
        args, _ = mock_shell.call_args_list[0]
        assert "sudo -S -v" in args[0]
        
        # 2. Refresh (might be called multiple times)
        args_refresh, _ = mock_shell.call_args_list[1]
        assert "sudo -n -v" in args_refresh[0]
        
    print("PASS: SudoKeepAlive Lifecycle")

async def test_async_executor_with_sudo_lock():
    print("\nTEST: AsyncGraphExecutor with Sudo Lock")
    
    # Workflow
    workflow = {
        "id": "test_sudo",
        "nodes": [
            {
                "id": "SECURE_NODE", 
                "type": "commandNode", 
                "data": {
                    "command": "echo secure", 
                    "sudoLock": True
                }
            }
        ],
        "edges": []
    }
    
    # Register Node
    NodeRegistry.register("commandNode", MockCommandNode)
    
    # Global Context
    global_context = {"sudo_password": "secret"}
    
    # Mock SudoKeepAlive to avoid actual subprocess
    with patch("backend.engine.security.SudoKeepAlive") as MockKA:
        # Setup Mock Context Manager
        mock_ka_instance = AsyncMock()
        MockKA.return_value = mock_ka_instance
        mock_ka_instance.__aenter__.return_value = None
        mock_ka_instance.__aexit__.return_value = None
        
        # Mock subprocess for the actual command execution
        with patch("asyncio.create_subprocess_shell") as mock_shell:
            mock_proc = AsyncMock()
            mock_proc.wait.return_value = 0
            mock_proc.stdout.readline.side_effect = [b"secure\n", b""]
            mock_proc.stderr.readline.return_value = b""
            mock_shell.return_value = mock_proc
            
            executor = AsyncGraphExecutor(workflow, global_context=global_context)
            result = await executor.execute()
            
            # Assertions
            # Depending on how the context manager is called, verify arguments
            # If SudoKeepAlive is imported inside the function, we might need to patch it *where it is used*
            # The test patch above patches 'backend.engine.security.SudoKeepAlive'.
            # If 'command.node' imports 'from engine.security import SudoKeepAlive', we might need to patch 'engine.security.SudoKeepAlive'
            
            # Use sys.modules to patch widely if needed, or rely on import path matching.
            
            # Verify result
            if result["results"]["SECURE_NODE"]["status"] != "success":
                print(f"FAILURE DETAILS: {result}")
            
            assert result["results"]["SECURE_NODE"]["status"] == "success"
            
    print("PASS: AsyncGraphExecutor with Sudo Lock")

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
    
    with patch("asyncio.create_subprocess_shell") as mock_shell:
        # We only expect PENDING_NODE to run
        mock_proc = AsyncMock()
        mock_proc.wait.return_value = 0
        mock_proc.stdout.readline.side_effect = [b"pending\n", b""]
        mock_proc.stderr.readline.return_value = b""
        mock_shell.return_value = mock_proc
        
        executor = AsyncGraphExecutor(workflow, initial_state=initial_state)
        
        # Check if DONE_NODE future is already set
        assert executor.futures["DONE_NODE"].done()
        assert executor.futures["DONE_NODE"].result()["stdout"] == "already done"
        
        result = await executor.execute()
        
        # Verify PENDING_NODE ran
        assert result["results"]["PENDING_NODE"]["status"] == "success"
        
        # Verify shell only called once (for pending node)
        # Note: If NodeRegistry uses the REAL CommandNode, it will log to stdout and emit events.
        # But we mock create_subprocess_shell.
        
        assert mock_shell.call_count == 1
        assert "echo pending" in mock_shell.call_args[0][0]
        
    print("PASS: Crash Recovery")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(test_sudo_keep_alive_lifecycle())
        loop.run_until_complete(test_async_executor_with_sudo_lock())
        loop.run_until_complete(test_crash_recovery())
    finally:
        loop.close()
