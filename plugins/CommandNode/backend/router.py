from fastapi import APIRouter, HTTPException
from .schema import GenerateCommandRequest, UIResponse, UIRender, ExecutionMetadata
from .service import generate_command

router = APIRouter()

@router.post("/generate-command", response_model=UIResponse)
async def generate_command_endpoint(request: GenerateCommandRequest):
    try:
        from app.core.system import get_system_fingerprint
        
        # Use provided context or fall back to live detection
        fingerprint = request.system_context if request.system_context else get_system_fingerprint()
        
        cmd_output = generate_command(request.prompt, fingerprint)
        
        # Map to UI Contract
        badge_color = "green"
        if cmd_output.risk_level == "CAUTION":
            badge_color = "yellow"
        elif cmd_output.risk_level == "CRITICAL":
            badge_color = "red"
            
        return UIResponse(
            node_id=request.node_id,
            status="ready",
            ui_render=UIRender(
                title=cmd_output.title,
                code_block=cmd_output.code_block,
                language="bash",
                badge_color=badge_color,
                description=cmd_output.description,
                system_effect=cmd_output.system_effect
            ),
            execution_metadata=ExecutionMetadata(
                requires_sudo=cmd_output.requires_sudo,
                is_interactive=False 
            )
        )
    except Exception as e:
        error_str = str(e)
        print(f"Generation error: {error_str}")
        
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            raise HTTPException(
                status_code=429, 
                detail="Gemini API Quota Exceeded. Please try again later."
            )
            
        raise HTTPException(status_code=500, detail=error_str)
