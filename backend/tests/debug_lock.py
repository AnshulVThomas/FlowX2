
import asyncio
import sys
import os
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure backend path
sys.path.append(os.getcwd())
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))

async def debug_lock():
    print("--- Debugging CommandNode Lock Logic ---")
    
    # 1. Load Plugin Manually
    try:
        from backend.plugins.CommandNode.backend.node import CommandNode
    except ImportError:
        try:
            from plugins.CommandNode.backend.node import CommandNode
        except ImportError:
            print("Could not import CommandNode from plugins.")
            return

    # 2. Test Validation
    print("\n[Test 1] Validation Logic")
    node_data_locked = {
        "id": "LOCKED_NODE",
        "type": "commandNode",
        "data": {
            "command": "echo unsafe",
            "locked": True,
            "sudoLock": False
        }
    }
    
    node = CommandNode(node_data_locked["data"])
    validation_result = node.validate(node_data_locked)
    
    print(f"Locked Node Validation Result: {validation_result}")
    
    if validation_result["valid"] == False and "Node is locked" in str(validation_result["errors"]):
        print("PASS: Validation correctly blocked locked node.")
    else:
        print("FAIL: Validation allowed locked node OR gave wrong error.")

    # 3. Test Execution (Directly, bypassing validator to see what happens)
    print("\n[Test 2] Execution Logic (Bypassing Validation)")
    
    context = {"context": {"sudo_password": "secret_pass"}}
    payload = {}

    with patch("backend.plugins.CommandNode.backend.node.execute_in_pty", new_callable=AsyncMock) as mock_pty:
        mock_pty.return_value = (0, "Executed\n", "")
        
        try:
            # We expect this to fail now
            result = await node.execute(context, payload)
            print(f"Execution Result: {result}")
            
            if result.get("status") == "error" and "Node is intentionally LOCKED" in result.get("stdout"):
                print("PASS: Execution correctly blocked locked node.")
            else:
                 print("FAIL: Execution allowed locked node or gave wrong error.")

            # Check what was passed to PTY (Should be nothing if blocked)
            if mock_pty.called:
                print("FAIL: PTY was called despite lock!")
            else:
                print("PASS: PTY was NOT called.")

        except Exception as e:
            print(f"Execution raised exception: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(debug_lock())
