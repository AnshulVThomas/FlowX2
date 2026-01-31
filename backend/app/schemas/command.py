from pydantic import BaseModel, Field
from typing import Literal

# --- 1. Define Standard Schema ---
class CommandNodeOutput(BaseModel):
    """
    Strict schema for the AI's command generation output.
    Ensures that every command comes with an explanation and risk assessment.
    """
    bash_script: str = Field(..., description="The executable bash command or script.")
    explanation: str = Field(..., description="A concise summary of what this does.")
    risk_level: Literal["SAFE", "CAUTION", "CRITICAL"] = Field(..., description="Risk assessment.")
    requires_sudo: bool = Field(..., description="True if the command needs elevation.")

# --- 2. API Contract Schemas ---
class GenerateCommandRequest(BaseModel):
    prompt: str
    node_id: str

class UIRender(BaseModel):
    title: str
    code_block: str
    language: str = "bash"
    badge_color: str

class ExecutionMetadata(BaseModel):
    requires_sudo: bool
    is_interactive: bool = False

class UIResponse(BaseModel):
    node_id: str
    status: str = "ready"
    ui_render: UIRender
    execution_metadata: ExecutionMetadata
