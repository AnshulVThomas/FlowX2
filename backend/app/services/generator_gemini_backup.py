import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.schemas.command import CommandNodeOutput

load_dotenv()

# --- HELPER: Model Selector ---
def get_active_model() -> str:
    """
    Determines which model to use based on the .env FLOWX_MODE variable.
    """
    mode = os.environ.get("FLOWX_MODE", "demo").lower()
    
    if mode == "dev":
        # STRATEGY: High Quota, Good Enough for Testing
        print("🛠️ [MODE: DEV] Using Model: Gemma 3 27B IT")
        return "gemma-3-27b-it"
    else:
        # STRATEGY: High Intelligence, Low Quota (for Demos)
        print("🚀 [MODE: DEMO] Using Model: Gemini 2.0 Flash Exp")
        return "gemini-2.0-flash-exp"

# --- MAIN: Generator Function ---
def generate_command(user_request: str, system_fingerprint: dict) -> CommandNodeOutput:
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("CRITICAL: GEMINI_API_KEY is missing from .env")

    client = genai.Client(api_key=api_key)
    model_name = get_active_model()

    # Define System Identity
    system_identity = f"""
    You are the Command Node for FlowX. 
    Target System: {system_fingerprint.get('os_distro', 'Unknown Distro')}
    System Context: {system_fingerprint}
    
    RULES:
    1. Output ONLY valid JSON matching the schema.
    2. The 'code_block' must be executable Bash.
    3. Do NOT use interactive editors (nano, vim). Use 'sed', 'printf', or 'cat' for file edits.
    4. If the user is on Arch, prioritize 'pacman' or 'yay'.
    5. If the user is on Fedora, use 'dnf'.
    6. Be concise.
    """

    import json
    import re

    try:
        # THE SWITCH LOGIC
        if "gemma" in model_name.lower():
            # === PATH A: GEMMA (No Native JSON Mode / No System Instruction) ===
            # We must prompt-engineer for strict JSON
            
            strict_json_prompt = f"""
            {system_identity}
            
            IMPORTANT: You must return the result as a raw JSON object. 
            Do NOT include markdown formatting (like ```json). 
            Do NOT include any text outside the JSON object.
            
            Schema:
            {{
                "title": "Short title",
                "code_block": "Bash command",
                "description": "Short explanation",
                "system_effect": "Side effects",
                "risk_level": "SAFE" | "CAUTION" | "CRITICAL",
                "requires_sudo": boolean
            }}
            
            USER REQUEST: {user_request}
            """
            
            response = client.models.generate_content(
                model=model_name,
                contents=strict_json_prompt,
                # No JSON config for Gemma
            )
            
            # Manual Parsing
            raw_text = response.text
            
            # extract json block if wrapped in code fences
            json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Clean up potential leading/trailing junk
                json_str = raw_text.strip()
                
            try:
                data = json.loads(json_str)
                return CommandNodeOutput(**data)
            except json.JSONDecodeError:
                # Fallback: simple cleanup logic or retry (here we just fail explicitly)
                print(f"FAILED TO PARSE JSON: {raw_text}")
                raise ValueError(f"Model {model_name} failed to produce valid JSON.")

        else:
            # === PATH B: GEMINI (Native System Instruction + Native JSON Mode) ===
            response = client.models.generate_content(
                model=model_name,
                contents=user_request,
                config=types.GenerateContentConfig(
                    system_instruction=system_identity,
                    response_mime_type="application/json", 
                    response_schema=CommandNodeOutput
                )
            )

        return response.parsed

    except Exception as e:
        print(f"❌ GENERATION FAILED on model {model_name}")
        print(f"Error Details: {e}")
        # Re-raise to let the main.py error handler process it (e.g. 429 logic)
        raise e

# --- Test ---
if __name__ == "__main__":
    from app.core.system import get_system_fingerprint
    
    fingerprint = get_system_fingerprint()
    print(f"Testing with Context: {fingerprint['os_name']}")
    
    cmd = generate_command("install the latest python version", fingerprint)
    print(f"\nGenerative Output:\n{cmd.model_dump_json(indent=2)}")