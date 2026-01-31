import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def list_available_models():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY not found in environment.")
        return

    client = genai.Client(api_key=api_key)
    
    print(f"{'Model ID':<40} | {'Display Name':<30}")
    print("-" * 75)

    try:
        # Paginates through all available models
        # We catch attributes errors just in case, but 'name' and 'display_name' are standard
        for model in client.models.list():
            # Filter out embedding models to reduce noise (optional)
            if "embed" in model.name:
                continue
                
            print(f"{model.name.replace('models/', ''):<40} | {model.display_name:<30}")
                
    except Exception as e:
        print(f"Error fetching models: {e}")

if __name__ == "__main__":
    list_available_models()