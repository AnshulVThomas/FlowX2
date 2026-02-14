from typing import Literal

from langchain.chat_models import init_chat_model
from langchain_core.messages import SystemMessage
from langgraph.graph import END, StateGraph, START
from langgraph.prebuilt import ToolNode

from backend.state import AgentState

def agent_node(state: AgentState, config: dict):
    """
    The main agent node that calls the LLM.
    Configuration (model, provider, system_prompt) is passed via the 'configurable' key.
    """
    configurable = config.get("configurable", {})
    
    # Extract configuration from the canvas Agent Node
    model_name = configurable.get("model_name", "gpt-4o")
    model_provider = configurable.get("model_provider", "openai")
    system_prompt = configurable.get("system_prompt", "You are a helpful assistant.")
    api_key = configurable.get("api_key")

    # Initialize the model dynamically
    # Note: Ensure environment variables are set or api_key is passed if needed
    model = init_chat_model(model_name, model_provider=model_provider)
    
    if api_key:
        # Some providers might need the key passed explicitly if not in env
        # This depends on the specific integration implementation
        pass

    # Prepare messages with system prompt
    messages = [SystemMessage(content=system_prompt)] + list(state["messages"])
    
    # Invoke the model
    response = model.invoke(messages)
    
    return {"messages": [response]}

# Define the graph
workflow = StateGraph(AgentState)

workflow.add_node("agent", agent_node)

workflow.add_edge(START, "agent")
workflow.add_edge("agent", END)

graph = workflow.compile()
