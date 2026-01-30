import requests
import uuid

BASE_URL = "http://localhost:8000"

def test_delete_workflow():
    # 1. Create a dummy workflow
    workflow_id = str(uuid.uuid4())
    payload = {
        "id": workflow_id,
        "name": "Delete Me",
        "data": {"nodes": [], "edges": []}
    }
    
    print(f"Creating workflow {workflow_id}...")
    create_res = requests.post(f"{BASE_URL}/workflows", json=payload)
    if create_res.status_code != 200:
        print(f"Failed to create workflow: {create_res.text}")
        return

    # 2. Verify it exists
    get_res = requests.get(f"{BASE_URL}/workflows/{workflow_id}")
    if get_res.status_code != 200:
        print("Failed to fetch created workflow")
        return
    print("Workflow created and verified.")

    # 3. Delete it
    print(f"Deleting workflow {workflow_id}...")
    delete_res = requests.delete(f"{BASE_URL}/workflows/{workflow_id}")
    if delete_res.status_code != 200:
         print(f"Failed to delete workflow: {delete_res.text}")
         return
    print("Delete request successful.")

    # 4. Verify it's gone
    print("Verifying deletion...")
    check_res = requests.get(f"{BASE_URL}/workflows/{workflow_id}")
    if check_res.status_code == 404:
        print("SUCCESS: Workflow deleted successfully (404 returned).")
    else:
        print(f"FAILURE: Workflow still exists or unexpected status: {check_res.status_code}")

if __name__ == "__main__":
    try:
        test_delete_workflow()
    except Exception as e:
        print(f"An error occurred: {e}")
