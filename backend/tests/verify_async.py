import asyncio
import sys
import os

# Ensure we are running from backend directory logic
# Add current directory to sys.path if not present
if os.getcwd() not in sys.path:
    sys.path.append(os.getcwd())

print(f"DEBUG: Script started. CWD: {os.getcwd()}", flush=True)

try:
    # Try importing assuming we are in 'backend' dir, so 'engine' is top-level
    from engine.async_runner import AsyncGraphExecutor, SKIP_BRANCH
    from engine.registry import NodeRegistry
    print("DEBUG: Imports successful (relative to backend)", flush=True)
except ImportError:
    # Fallback: maybe we are in root, try backend.engine...
    try:
        from backend.engine.async_runner import AsyncGraphExecutor, SKIP_BRANCH
        from backend.engine.registry import NodeRegistry
        print("DEBUG: Imports successful (absolute backend.)", flush=True)
    except ImportError as e:
        print(f"DEBUG: Import failed: {e}", flush=True)
        sys.exit(1)

# Mock Node
class MockNode:
    def __init__(self, data):
        self.data = data
        
    async def execute(self, context, payload):
        command = self.data.get("command", "")
        # print(f"DEBUG: Executing {command}", flush=True)
        if command == "sleep 2":
            await asyncio.sleep(2)
            return {"status": "success", "stdout": "slept"}
        elif command == "fail":
            raise Exception("Intentional Failure")
        else:
            return {"status": "success", "stdout": f"executed {command}"}

# Register Mock Node
print("DEBUG: Registering mock nodes", flush=True)
NodeRegistry.register("commandNode", MockNode)
NodeRegistry.register("startNode", MockNode)

async def test_async_execution_parallel():
    print("Running Parallel Execution Test...", flush=True)
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
    print(f"Duration: {duration:.2f}s", flush=True)
    
    if duration < 1.9:
        print("FAIL: Creation completed too fast (nodes didn't run properly?)", flush=True)
    elif duration > 3.0: 
        print("FAIL: Took too long", flush=True)
    else:
        print("PASS: Timing correct", flush=True)
        
    results = result.get("results", {})
    if results.get("FAST", {}).get("stdout") == "executed fast" and results.get("SLOW", {}).get("stdout") == "slept":
        print("PASS: Outputs correct", flush=True)
    else:
        print(f"FAIL: Outputs incorrect: {results}", flush=True)

async def test_branching_skip():
    print("\nRunning Branching Skip Test...", flush=True)
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
    
    executor = AsyncGraphExecutor(workflow)
    result = await executor.execute()
    
    results = result.get("results", {})
    if results.get("FAIL", {}).get("status") == "failed":
        print("PASS: Failure recorded", flush=True)
    else:
        print(f"FAIL: Expected failure for FAIL node, got {results.get('FAIL')}", flush=True)
        
    if "DEPENDENT" not in results:
        print("PASS: Dependent node skipped", flush=True)
    else:
        print(f"FAIL: Dependent node executed: {results.get('DEPENDENT')}", flush=True)

async def main():
    await test_async_execution_parallel()
    await test_branching_skip()

if __name__ == "__main__":
    asyncio.run(main())
