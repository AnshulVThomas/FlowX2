import os
from google import genai
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def test():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    
    print("Testing generate_content with dict config...")
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents='Return a structured JSON object with key "hello" and value "world"',
            config={"temperature": 0.1, "response_mime_type": "application/json"}
        )
        print("✅ Dict config succeeded!")
        print(response.text)
    except Exception as e:
        print(f"❌ Dict config failed: {e}")
        
    print("\nTesting generate_content with GenerateContentConfig...")
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents='Return a structured JSON object with key "hello" and value "world"',
            config=genai.types.GenerateContentConfig(
                temperature=0.1, 
                response_mime_type="application/json"
            )
        )
        print("✅ Typed config succeeded!")
        print(response.text)
    except Exception as e:
        print(f"❌ Typed config failed: {e}")

if __name__ == "__main__":
    test()
