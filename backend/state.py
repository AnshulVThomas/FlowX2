import operator
from typing import Annotated, Sequence, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages

class AgentState(TypedDict):
    """The state of the agent, containing the conversation history."""
    messages: Annotated[Sequence[BaseMessage], add_messages]
