import json
import os
import asyncio
from typing import Dict, Any
from engine.protocol import FlowXNode, ValidationResult
from groq import Groq
from .tools import TOOL_IMPLEMENTATIONS

class ReActAgentNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        if not data.get("data", {}).get("prompt"):
            return {"valid": False, "errors": [{"message": "Instruction prompt is required"}]}
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        runtime_ctx = ctx.get("context", {})
        emit = runtime_ctx.get("emit_event")
        
        # 1. SETUP CLIENT
        api_key = os.getenv("GROQ_API_KEY_FOR_REACT_AGENT") 
        if not api_key: return {"status": "failed", "output": {"error": "Missing GROQ_API_KEY_FOR_REACT_AGENT"}}
        client = Groq(api_key=api_key)

        # 2. DYNAMIC CAPABILITY LOADING
        inputs = payload.get("inputs", {})
        allowed_tools = {}     
        tool_definitions = []  
        context_str = "--- CONTEXT ---\n"

        for parent_id, data in inputs.items():
            output = data.get("output", {})
            
            # CHECK FOR PERMISSION TOKEN
            # This is the Push-Engine magic. If a tool node ran, it dropped a definition here.
            if output.get("type") == "TOOL_DEF":
                tool_def = output.get("definition")
                t_name = tool_def["name"]
                if t_name in TOOL_IMPLEMENTATIONS:
                    allowed_tools[t_name] = TOOL_IMPLEMENTATIONS[t_name]
                    tool_definitions.append(tool_def)
            else:
                # Standard Context (e.g. Command Node output)
                context_str += f"[Node {parent_id}]: {output.get('stdout', str(output))}\n"

        # 3. CONSTRUCT SYSTEM PROMPT
        tools_desc = "NO TOOLS AVAILABLE."
        if tool_definitions:
            tools_desc = "AVAILABLE TOOLS:\n" + "\n".join(
                [f"- {t['name']}: {t['description']} (Args: {t['parameters']})" for t in tool_definitions]
            )

        messages = [
            {"role": "system", "content": f"You are an Agent. {tools_desc}\nRespond in JSON: {{\"thought\": \"...\", \"action\": \"tool_name\", \"args\": \"...\"}}"},
            {"role": "user", "content": f"{context_str}\nGOAL: {self.data.get('prompt')}"}
        ]

        # 4. REACT LOOP (Max 5 Steps)
        final_response = ""
        history_log = []

        for i in range(5):
            if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"\n🤖 [Step {i+1}] Thinking...\n", "type": "stdout"})
            
            try:
                chat = await asyncio.to_thread(
                    client.chat.completions.create, messages=messages, model="llama-3.3-70b-versatile",
                    temperature=0.1, response_format={"type": "json_object"}
                )
            except Exception as e: return {"status": "failed", "output": {"error": str(e)}}

            llm_raw = chat.choices[0].message.content
            messages.append({"role": "assistant", "content": llm_raw})
            
            try:
                decision = json.loads(llm_raw)
                action = decision.get("action")
                args = decision.get("args")
                if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"🤔 {decision.get('thought')}\n⚡ {action}('{args}')\n", "type": "stdout"})
            except: 
                continue

            if action == "final_answer":
                final_response = args
                break

            # EXECUTE TOOL (Permission Check)
            if action in allowed_tools:
                tool_output = allowed_tools[action](args)
            else:
                tool_output = f"Error: Permission Denied. Tool '{action}' is not connected."
            
            if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"   -> {tool_output[:100]}...\n", "type": "stdout"})
            messages.append({"role": "user", "content": f"Tool Output: {tool_output}"})
            history_log.append({"step": i+1, "type": "observation", "content": tool_output})

        return {"status": "success", "output": {"response": final_response, "history": history_log}}

    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
