import asyncio
import sys
import os
from unittest.mock import MagicMock, patch

# Fix import path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from engine.nodes.command_node import CommandNode

async def verify():
    print("--- Verifying CommandNode Logic with Mocks ---")
    
    # Test 1: Sudo Detection
    print("\nTest: Sudo Detection (Mocked)")
    node = CommandNode({"command": "apt update"})
    
    # Mock Process Object for Failure
    mock_proc_fail = MagicMock()
    # communicate needs to be awaitable
    future_fail = asyncio.Future()
    future_fail.set_result((b"", b"Permission denied"))
    mock_proc_fail.communicate.return_value = future_fail
    mock_proc_fail.returncode = 126
    
    with patch("asyncio.create_subprocess_shell", return_value=mock_proc_fail) as mock_shell:
        try:
            await node.execute({}, {})
            print("FAIL: Should have raised NodeInterrupt")
        except Exception as e:
            if "Sudo Password Required" in str(e):
                print("PASS: Caught expected interrupt")
            else:
                print(f"FAIL: Unexpected error {e}")

    # Test 2: Resume Logic (Rehydration)
    print("\nTest: Resume Logic (Mocked)")
    # We must use a command containing 'sudo' for the injection logic to trigger
    node = CommandNode({"command": "sudo apt update"})
    ctx = {"sudo_password": "secret_pass"}
    
    # Mock Process for Success
    mock_proc_success = MagicMock()
    future_success = asyncio.Future()
    future_success.set_result((b"Success", b""))
    mock_proc_success.communicate.return_value = future_success
    mock_proc_success.returncode = 0
    
    with patch("asyncio.create_subprocess_shell", return_value=mock_proc_success) as mock_shell:
        result = await node.execute(ctx, {})
        
        # Verify the command called
        # mock_shell.call_args[0][0] is the first arg (cmd)
        called_cmd = mock_shell.call_args[0][0]
        expected_part = "echo 'secret_pass' | sudo -S apt update"
        
        if expected_part in called_cmd:
            print(f"PASS: Command injected correctly: {called_cmd}")
        else:
            print(f"FAIL: Command not injected. Got: {called_cmd}")
            
        if result["status"] == "success":
             print("PASS: Execution Status Success")

if __name__ == "__main__":
    # AsyncMock is needed for await communicate()
    # But since we simple mock return value of communicate to be a coroutine result (tuple), 
    # we need to be careful. mock_proc.communicate needs to be awaitable.
    # Easy fix: set return_value to a Future
    async def run_test():
        # Setup helpers
        future_fail = asyncio.Future()
        future_fail.set_result((b"", b"Permission denied"))
        
        future_success = asyncio.Future()
        future_success.set_result((b"Success", b""))
        
        # Patching inside verify won't easily let us assign different Futures to different instances 
        # unless we control the mock creation inside.
        # Let's just inline the test logic here to control mocks better.
        pass

    asyncio.run(verify())
