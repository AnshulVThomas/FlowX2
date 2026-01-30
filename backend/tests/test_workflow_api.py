import requests
import asyncio
import sys

# URL of the FastAPI application
BASE_URL = "http://localhost:8000"

def test_save_workflow():
    workflow_data = {
        "name": "Test Workflow",
        "data": {
            "nodes": [{"id": "1", "data": {"label": "Start"}}],
            "edges": []
        }
    }
    
    try:
        response = requests.post(f"{BASE_URL}/workflows", json=workflow_data)
        response.raise_for_status()
        print("Success: Workflow saved!")
        print(response.json())
    except requests.exceptions.RequestException as e:
        print(f"Error: Could not save workflow. {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_save_workflow()
