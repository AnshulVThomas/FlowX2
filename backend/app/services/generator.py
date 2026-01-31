import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.schemas.command import CommandNodeOutput

load_dotenv()

# --- 2. The Generator Function ---
def generate_command(user_request: str, system_fingerprint: dict) -> CommandNodeOutput:
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")

    client = genai.Client(api_key=api_key)

    system_prompt = f"""
    You are the Command Node for FlowX. 
    Target System: {system_fingerprint.get('os_distro', 'Unknown Distro')}
    System Context: {system_fingerprint}
    
    RULES:
    1. Output ONLY Bash.
    2. Do NOT use interactive editors (nano, vim). Use 'sed', 'printf', or 'cat' for file edits.
    3. If the user is on Arch, prioritize 'pacman' or 'yay'.
    4. If the user is on Fedora, use 'dnf'.
    5. Be concise.
    """

    # Determine Switching Mode
    flowx_mode = os.environ.get("FLOWX_MODE", "demo").lower()
    
    if flowx_mode == "dev":
        # User requested specific Gemma 3 models
        primary_model = "gemma-3-27b-it" 
        fallback_model = "gemma-3-12b-it"
    else:
        # Default / Demo mode (Restoring user's previous working models)
        primary_model = "gemini-3-flash-preview" 
        fallback_model = "gemini-2.5-flash"

    try:
        response = client.models.generate_content(
            model=primary_model,
            contents=user_request,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json", 
                response_schema=CommandNodeOutput, 
            )
        )
        return response.parsed
        
    except Exception as e:
        print(f"⚠️  {primary_model} failed (Status: {e}). Switching to {fallback_model}...")
        
        # Fallback to the stable model if the preview is acting up
        response = client.models.generate_content(
            model=fallback_model,
            contents=user_request,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json", 
                response_schema=CommandNodeOutput, 
            )
        )
        return response.parsed

# --- Test ---
if __name__ == "__main__":
    from app.core.system import get_system_fingerprint
    
    fingerprint = get_system_fingerprint()
    print(f"Testing with Context: {fingerprint['os_name']}")
    
    cmd = generate_command("install the latest python version", fingerprint)
    print(f"\nGenerative Output:\n{cmd.model_dump_json(indent=2)}")