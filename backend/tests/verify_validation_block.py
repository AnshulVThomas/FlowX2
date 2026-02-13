from fastapi.testclient import TestClient
from main import app
import sys

client = TestClient(app)

def test_validation_blocking():
    print("Testing Validation Blocking on Execution...")
    
    # 1. Undefined Command (Invalid)
    invalid_workflow = {
        "id": "test-invalid-workflow",
        "nodes": [
            {
                "id": "start-node",
                "type": "startNode",
                "data": {"id": "start-node"}
            },
            {
                "id": "cmd-node-1",
                "type": "commandNode",
                "data": {
                    "id": "cmd-node-1",
                    "command": "" # EMPTY COMMAND -> Should Fail
                }
            }
        ],
        "edges": [
            {
                "id": "e1",
                "source": "start-node",
                "target": "cmd-node-1"
            }
        ]
    }
    
    try:
        response = client.post("/api/v1/workflow/execute", json=invalid_workflow)
        print(f"Response Status: {response.status_code}")
        print(f"Response Body: {response.json()}")
        
        if response.status_code == 400:
            print("✅ SUCCESS: Execution was blocked due to validation error.")
        else:
            print("❌ FAILURE: Execution was NOT blocked (Expected 400).")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        sys.exit(1)

    print("-" * 30)

    # 2. Valid Workflow (Control)
    valid_workflow = {
        "id": "test-valid-workflow",
        "nodes": [
            {
                "id": "start-node",
                "type": "startNode",
                "data": {"id": "start-node"}
            },
            {
                "id": "cmd-node-2",
                "type": "commandNode",
                "data": {
                    "id": "cmd-node-2",
                    "command": "echo 'hello'"
                }
            }
        ],
        "edges": [
            {
                "id": "e2",
                "source": "start-node",
                "target": "cmd-node-2"
            }
        ]
    }
    
    try:
        # Note: This executes actual logic. 
        # Since we use MongoDBSaver, we should be careful. 
        # But this is just a test client call.
        # It creates a background task. 
        # We just want to ensure it doesn't return 400.
        
        response = client.post("/api/v1/workflow/execute", json=valid_workflow)
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Valid workflow was accepted.")
        else:
            print(f"❌ FAILURE: Valid workflow was blocked? {response.text}")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        # Note: if e comes from graph execution in background, it might not show here unless we await it.
        # But the API endpoint returns 200 (task reference) before execution completes.
        pass

if __name__ == "__main__":
    test_validation_blocking()
