import os
import json
from dotenv import load_dotenv
from groq import Groq
from app.schemas.command import CommandNodeOutput

load_dotenv()

# UPDATE .env with this model string
# FLOWX_MODEL="meta-llama/llama-4-maverick-17b-128e-instruct"

def generate_command(user_request: str, system_fingerprint: dict) -> CommandNodeOutput:
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
    primary_model = os.environ.get("FLOWX_MODEL", "meta-llama/llama-4-maverick-17b-128e-instruct")
    fallback_model = os.environ.get("FLOWX_MODEL_FALLBACK", "meta-llama/llama-3.3-70b-versatile")

    # OPTIMIZATION 1: Strict Tool Definition
    # MoE models need very explicit type constraints
    tools = [{
        "type": "function",
        "function": {
            "name": "generate_bash",
            "description": "Generates a Bash command. MUST be non-interactive.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning": { 
                        "type": "string", 
                        "description": "Step-by-step logic for why this command was chosen."
                    },
                    "title": {"type": "string"},
                    "code_block": {"type": "string"},
                    "description": {"type": "string"},
                    "risk_level": {"type": "string", "enum": ["SAFE", "CAUTION", "CRITICAL"]},
                    "requires_sudo": {"type": "boolean"},
                    "system_effect": {"type": "string"}
                },
                "required": ["reasoning", "title", "code_block", "description", "risk_level"]
            }
        }
    }]

    # OPTIMIZATION 2: CoT System Prompt
    # We tell the model to "route" correctly by thinking first.
    system_prompt = f"""
    You are an Expert Arch Linux Administrator. Target: {system_fingerprint.get('os_distro', 'Linux')}.
    
    PROTOCOL:
    1. Analyze the user request.
    2. Determine the safest Pacman/Systemd command.
    3. EXPLAIN your reasoning in the 'reasoning' field to activate the correct experts.
    4. Generate the final JSON.
    """

    def generate_with_model(model_id):
        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_request}
            ],
            tools=tools,
            tool_choice={"type": "function", "function": {"name": "generate_bash"}},
            temperature=0.3
        )
        tool_call = response.choices[0].message.tool_calls[0]
        args = json.loads(tool_call.function.arguments)
        if "reasoning" in args:
            del args["reasoning"]
        return CommandNodeOutput(**args)

    try:
        # Try Primary Model
        return generate_with_model(primary_model)

    except Exception as e:
        print(f"Primary Model ({primary_model}) Error: {e}")
        print(f"⚠️ Switching to Fallback: {fallback_model}...")
        
        try:
            # Try Fallback Model
            return generate_with_model(fallback_model)
        except Exception as fallback_error:
            print(f"Fallback Model Error: {fallback_error}")
            
            # Failover / Safe Return
            return CommandNodeOutput(
                 title="Error", 
                 code_block=f"# Generation Failed: {str(e)}", 
                 description="The AI failed to generate a command.", 
                 risk_level="CAUTION", 
                 requires_sudo=False, 
                 system_effect="None"
            )