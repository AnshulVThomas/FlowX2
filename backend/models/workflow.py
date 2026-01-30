from pydantic import BaseModel
from typing import Dict, Any, Optional

class Workflow(BaseModel):
    name: str
    data: Dict[str, Any]
    id: Optional[str] = None
