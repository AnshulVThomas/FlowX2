import requests
import json

def test_workflow_endpoint():
    url = "http://localhost:8000/workflows"
    payload = {
        "name": "test_workflow",
        "data": {"steps": ["step1", "step2"]}
    }
    
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except requests.exceptions.ConnectionError:
        print("Failed to connect to server. Is it running?")

if __name__ == "__main__":
    test_workflow_endpoint()
