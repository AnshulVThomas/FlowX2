import os
from google import genai
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def list_available_models():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY not found in .env")
        return

    try:
        client = genai.Client(api_key=api_key)
        print(f"{'Model ID':<45} | {'Display Name':<30} | {'Description'}")
        print("-" * 120)

        models = list(client.models.list())
        # Sort by name for better readability
        models.sort(key=lambda m: m.name)

        for model in models:
            # Skip embedding models usually
            # if "embed" in model.name:
            #     continue
            
            # remove 'models/' prefix from the name if it exists
            model_id = model.name.replace('models/', '')
            
            desc = model.description if hasattr(model, 'description') and model.description else "N/A"
            if len(desc) > 40:
                desc = desc[:37] + "..."
                
            display = model.display_name if hasattr(model, 'display_name') and model.display_name else "N/A"
            print(f"{model_id:<45} | {display:<30} | {desc}")
            
    except Exception as e:
        print(f"❌ Error fetching models: {e}")

if __name__ == "__main__":
    list_available_models()
