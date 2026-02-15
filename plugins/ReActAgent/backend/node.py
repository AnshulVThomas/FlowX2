import json
import os
import asyncio
from datetime import datetime
from typing import Dict, Any, List
from engine.protocol import FlowXNode, ValidationResult
from groq import Groq
from database.connection import db

# --- MEMORY HELPERS ---
async def fetch_agent_memory(thread_id: str, node_id: str, limit: int = 5) -> List[Dict]:
    """Retrieves the last N memory entries for this specific agent instance."""
    if not thread_id: return []
    try:
        database = db.get_db()
        doc = await database.agent_memories.find_one(
            {"thread_id": thread_id, "node_id": node_id}
        )
        if doc and "history" in doc:
            return doc["history"][-limit:]
        return []
    except Exception as e:
        print(f"[Memory Read Error] {e}")
        return []

async def append_agent_memory(thread_id: str, node_id: str, entry: Dict):
    """Appends a new execution summary to the agent's long-term memory."""
    if not thread_id: return
    try:
        database = db.get_db()
        entry["timestamp"] = datetime.utcnow().isoformat()
        
        await database.agent_memories.update_one(
            {"thread_id": thread_id, "node_id": node_id},
            {
                "$push": {"history": entry},
                "$set": {"last_updated": datetime.utcnow()} # Top-level timestamp for TTL
            },
            upsert=True
        )
    except Exception as e:
        print(f"[Memory Write Error] {e}")

class ReActAgentNode(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        if not data.get("data", {}).get("prompt"):
            return {"valid": False, "errors": [{"message": "Instruction prompt is required"}]}
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
        runtime_ctx = ctx.get("context", {})
        emit = runtime_ctx.get("emit_event")
        thread_id = runtime_ctx.get("thread_id") 
        node_id = self.data.get("id")
        
        print(f"[AGENT 🧠] Starting Execution. Thread: {thread_id}, Node: {node_id}")

        # 1. SETUP CLIENT
        api_key = os.getenv("GROQ_API_KEY_FOR_REACT_AGENT") 
        if not api_key: return {"status": "failed", "output": {"error": "Missing GROQ_API_KEY_FOR_REACT_AGENT"}}
        client = Groq(api_key=api_key)

        # 2. LOAD LONG-TERM MEMORY (The "Brain" Restore)
        past_memories = await fetch_agent_memory(thread_id, node_id)
        
        memory_str = "NO PREVIOUS ATTEMPTS."
        if past_memories:
            memory_str = "HISTORY OF PREVIOUS RUNS (DO NOT REPEAT FAILURES):\n"
            for i, mem in enumerate(past_memories):
                memory_str += f"- Attempt {i+1}: Action '{mem.get('summary')}'. Outcome: {mem.get('outcome')}\n"
        
        print(f"[AGENT 🧠] Loaded Memory: {len(past_memories)} entries.")

        # 3. DYNAMIC CAPABILITY LOADING
        inputs = payload.get("inputs", {})
        allowed_tools = {}     
        tool_definitions = []  
        context_str = "--- CONTEXT ---\n"
        
        print(f"[AGENT 🧠] Loading Tools from {len(inputs)} input nodes...")

        for parent_id, data in inputs.items():
            output = data.get("output", {})
            
            # CHECK FOR PERMISSION TOKEN
            if output.get("type") == "TOOL_DEF":
                tool_def = output.get("definition")
                t_name = tool_def["name"]
                print(f"[AGENT 🧠] + Connected Tool: {t_name}")
                
                # Support "Offloaded Function" Pattern (Function explicitly provided)
                if "implementation" in output:
                    allowed_tools[t_name] = output["implementation"]
                    tool_definitions.append(tool_def)

            else:
                # Standard Context (e.g. Command Node output)
                context_str += f"[Node {parent_id}]: {output.get('stdout', str(output))}\n"

        # 4. CONSTRUCT SYSTEM PROMPT WITH MEMORY
        tools_desc = "NO TOOLS AVAILABLE."
        if tool_definitions:
            tools_desc = "AVAILABLE TOOLS:\n" + "\n".join(
                [f"- {t['name']}: {t['description']} (Args: {t['parameters']})" for t in tool_definitions]
            )

        system_persona = (
            "You are the Persistent Autonomous Engine for this workflow.\n"
            "You have memory of previous attempts. Use it to avoid infinite loops.\n\n"
            "AUTHORITY & TOOLS:\n"
            f"{tools_desc}\n\n"
            "MEMORY CONTEXT:\n"
            f"{memory_str}\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. IF PREVIOUS RUNS FAILED: Do NOT try the same action again. Change your strategy.\n"
            "2. IF REPEATED FAILURES: Use 'stop_workflow' to prevent infinite loops.\n"
            "3. EFFICIENCY: If the answer is in the context, output 'final_answer' immediately.\n"
            "- You have full permission to EXECUTE commands via connected tools.\n"
            "- You have full permission to STOP or RESTART the workflow if you detect critical errors.\n\n"
            "RESPONSE FORMAT (JSON ONLY):\n"
            "{\"thought\": \"reasoning about the state\", \"action\": \"tool_name\", \"args\": \"string_arguments\"}\n"
            "OR if done:\n"
            "{\"thought\": \"task completed\", \"action\": \"final_answer\", \"args\": \"summary\"}"
        )

        messages = [
            {"role": "system", "content": system_persona},
            {"role": "user", "content": f"{context_str}\nCURRENT OBJECTIVE: {self.data.get('prompt')}"}
        ]

        # 5. REACT LOOP (Max 5 Steps)
        final_response = ""
        history_log = []
        
        # State tracking for memory save
        run_summary_action = "analysis_only" 
        run_outcome = "completed"
        
        print(f"[AGENT 🧠] Entering Loop (Max {os.getenv('REACT_AGENT_MAX_STEPS', 5)} steps)...")

        for i in range(int(os.getenv("REACT_AGENT_MAX_STEPS", 5))):
            if emit: await emit("node_log", {"nodeId": node_id, "log": f"\n🤖 [Step {i+1}] Thinking...\n", "type": "stdout"})
            
            try:
                chat = await asyncio.to_thread(
                    client.chat.completions.create, messages=messages, model=os.getenv("REACT_AGENT_MODEL", "llama-3.3-70b-versatile"),
                    temperature=0.1, response_format={"type": "json_object"}
                )
            except Exception as e: 
                print(f"[AGENT 🔴] LLM Error: {e}")
                return {"status": "failed", "output": {"error": str(e)}}

            llm_raw = chat.choices[0].message.content
            # print(f"[AGENT 💭] Raw LLM: {llm_raw}") # Too verbose? Maybe useful for deep debug.
            messages.append({"role": "assistant", "content": llm_raw})
            
            try:
                decision = json.loads(llm_raw)
                action = decision.get("action")
                args = decision.get("args")
                thought = decision.get("thought")
                print(f"[AGENT 🤔] Thought: {thought}")
                print(f"[AGENT ⚡] Action: {action} ({args})")

                if action != "final_answer":
                    run_summary_action = f"{action}({str(args)[:50]})" # Capture main action

                if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"🤔 {thought}\n⚡ {action}('{args}')\n", "type": "stdout"})
            except: 
                print(f"[AGENT ⚠️] Failed to parse JSON: {llm_raw}")
                continue

            if action == "final_answer":
                final_response = args
                run_outcome = "success"
                print(f"[AGENT ✅] Final Answer Reached.")
                break

            # EXECUTE TOOL (Permission Check)
            if action in allowed_tools:
                try:
                    tool_output = await allowed_tools[action](args) if asyncio.iscoroutinefunction(allowed_tools[action]) else allowed_tools[action](args)
                    
                    # --- SIGNAL DETECTION ---
                    if isinstance(tool_output, str) and tool_output.startswith("__FLOWX_SIGNAL__"):
                        print(f"[AGENT 🚨] SIGNAL RECEIVED: {tool_output}")
                        # Save memory immediately before the engine kills the process
                        await append_agent_memory(thread_id, node_id, {
                            "summary": run_summary_action,
                            "outcome": "triggered_signal",
                            "steps": i+1
                        })

                        return {
                            "status": "success",
                            "output": {
                                "response": "Control Signal Triggered",
                                "signal": tool_output,
                                "history": history_log
                            }
                        }
                except Exception as e:
                    tool_output = f"Execution Panic: {str(e)}"
                    print(f"[AGENT 🔴] Tool Execution Panic: {e}")
            else:
                tool_output = f"Error: Permission Denied. Tool '{action}' is not connected."
                print(f"[AGENT 🚫] Denied Action: {action}")
            
            if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"   -> {tool_output[:100]}...\n", "type": "stdout"})
            messages.append({"role": "user", "content": f"Tool Output: {tool_output}"})
            history_log.append({"step": i+1, "type": "observation", "content": tool_output})

        # 6. SAVE MEMORY (Standard Completion)
        print(f"[AGENT 💾] Saving Memory: {run_summary_action} -> {run_outcome}")
        await append_agent_memory(thread_id, node_id, {
            "summary": run_summary_action,
            "outcome": run_outcome,
            "steps": len(history_log)
        })

        return {"status": "success", "output": {"response": final_response, "history": history_log}} 


    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
