from pydantic import BaseModel, Field
from typing import Literal

class CommandNodeOutput(BaseModel):
    """
    Strict schema for the AI's command generation output.
    Ensures that every command comes with an explanation and risk assessment.
    """
    bash_script: str = Field(..., description="The executable bash command or script.")
    explanation: str = Field(..., description="A concise summary of what this does.")
    risk_level: Literal["SAFE", "CAUTION", "CRITICAL"] = Field(..., description="Risk assessment.")
    requires_sudo: bool = Field(..., description="True if the command needs elevation.")
