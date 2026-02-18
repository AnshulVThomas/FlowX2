
import asyncio
import sys
import os
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure backend path
sys.path.append(os.getcwd())
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))

async def reproduce():
    print("Trying to import CommandNode...")
    try:
        from backend.plugins.CommandNode.backend.node import CommandNode
    except ImportError:
        try:
            from plugins.CommandNode.backend.node import CommandNode
        except ImportError:
            print("Could not import CommandNode")
            return

    # Case: Non-sudo node (sudoLock=False), but locked=True
    data = {
        "id": "TEST_NODE",
        "command": "echo 'Hello'",
        "locked": True,
        "sudoLock": False
    }

    print(f"Instantiating CommandNode with data: {data}")
    node = CommandNode(data)
    
    context = {"context": {}} # runtime context
    payload = {}

    print("Executing node...")
    try:
        # Mock execute_in_pty so we don't actually run shell commands
        with patch("backend.plugins.CommandNode.backend.node.execute_in_pty", new_callable=AsyncMock) as mock_pty:
            mock_pty.return_value = (0, "Hello\n", "")
            
            result = await node.execute(context, payload)
            print(f"Execution Result: {result}")
            
    except Exception as e:
        print(f"Caught Exception: {type(e).__name__}: {e}")
        if type(e).__name__ == "NodeInterrupt":
            print(">>> REPRODUCTION SUCCESS: NodeInterrupt raised!")
        else:
            print("Caught other exception.")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(reproduce())
    finally:
        loop.close()
