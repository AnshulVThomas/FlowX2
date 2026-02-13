from pydantic import BaseModel, Field
from typing import Literal

# --- 1. Define Standard Schema ---
# --- 1. Define Standard Schema ---
class CommandNodeOutput(BaseModel):
    """
    Strict schema for the AI's command generation output.
    Ensures that every command comes with an explanation and risk assessment.
    """
    title: str = Field(..., description="A short, 3-5 word title for the card (e.g., 'Update System Packages').")
    code_block: str = Field(..., description="The exact Bash command.")
    
    # NEW FIELDS
    description: str = Field(..., description="A 1-sentence summary of what this command accomplishes.")
    system_effect: str = Field(..., description="Specific side effects: e.g., 'Restarts Nginx', 'High CPU usage', 'Modifies /etc/hosts'.")
    
    risk_level: Literal["SAFE", "CAUTION", "CRITICAL"] = Field(..., description="Risk assessment.")
    requires_sudo: bool = Field(..., description="True if sudo is needed.")

# --- 2. API Contract Schemas ---
class GenerateCommandRequest(BaseModel):
    prompt: str
    node_id: str
    system_context: dict | None = None

class UIRender(BaseModel):
    title: str
    code_block: str
    language: str = "bash"
    badge_color: str
    description: str
    system_effect: str

class ExecutionMetadata(BaseModel):
    requires_sudo: bool
    is_interactive: bool = False

class UIResponse(BaseModel):
    node_id: str
    status: str = "ready"
    ui_render: UIRender
    execution_metadata: ExecutionMetadata
