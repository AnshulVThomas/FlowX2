# FlowX LangGraph Integration Strategy (Human-in-the-Loop)

**Objective:** Integrate the Interactive PTY Terminal with LangGraph's automated workflow.
**Pattern:** "Interrupt & Resume" (Breakpoint Architecture).

## 1. The Workflow Logic
We do NOT keep the LangGraph node "open" while the user types. We use state persistence.

### The Graph Definition
- **Interrupt:** Set `interrupt_before=["execute_command"]`.
- **Checkpointer:** Use `MemorySaver` (Dev) or Postgres (Prod) to save state when paused.

```python
# backend/workflow.py
workflow = StateGraph(FlowState)
workflow.add_node("generate", generate_command_node) # Uses Gemini 3 Flash
workflow.add_node("execute_command", verification_node) # Checks if user ran it

# CRITICAL: Stop before execution to allow Human action
app = workflow.compile(
    checkpointer=checkpointer, 
    interrupt_before=["execute_command"]
)