import json
import re
import os
import sys
import asyncio
import traceback
from datetime import datetime
from typing import Dict, Any, List, Optional
from engine.protocol import FlowXNode, ValidationResult
from google import genai
from database.connection import db


# --- JSON EXTRACTION HELPER ---
def extract_json(text: str) -> Optional[dict]:
    """Extract JSON from LLM output that may contain markdown/prose."""
    # Fast path: already clean JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Regex fallback: find outermost { ... }
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None

# --- SAFETY HELPERS ---
def _safe_str(val: any, limit: int = 500) -> str:
    """Truncate any value to a safe string length for DB/context."""
    s = str(val)
    if len(s) > limit:
        return s[:limit] + "...[TRUNCATED]"
    return s

# --- MEMORY HELPERS ---
async def fetch_agent_memory(run_id: str, node_id: str, limit: int = 5) -> List[Dict]:
    """Retrieves the last N memory entries for this specific agent run."""
    if not run_id: return []
    try:
        database = db.get_db()
        doc = await database.agent_memories.find_one(
            {"run_id": run_id, "node_id": node_id}
        )
        if doc and "history" in doc:
            return doc["history"][-limit:]
        return []
    except Exception as e:
        print(f"[Memory Read Error] {e}")
        return []

async def append_agent_memory(run_id: str, node_id: str, entry: Dict):
    """Appends a new execution summary to the agent's run-scoped memory."""
    if not run_id: return
    try:
        database = db.get_db()
        entry["timestamp"] = datetime.utcnow().isoformat()
        
        await database.agent_memories.update_one(
            {"run_id": run_id, "node_id": node_id},
            {
                "$push": {"history": {"$each": [entry], "$slice": -20}},
                "$set": {"last_updated": datetime.utcnow()}
            },
            upsert=True
        )
    except Exception as e:
        print(f"[Memory Write Error] {e}")

class ReActAgentNodeV2(FlowXNode):
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        if not data.get("data", {}).get("prompt"):
            return {"valid": False, "errors": [{"message": "Instruction prompt is required"}]}
        return {"valid": True, "errors": []}

    async def execute(self, ctx: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
      try:
        runtime_ctx = ctx.get("context", {})
        emit = runtime_ctx.get("emit_event")
        thread_id = runtime_ctx.get("thread_id")
        run_id = runtime_ctx.get("run_id", thread_id)  # Fallback to thread_id if run_id not set
        node_id = self.data.get("id")
        
        print(f"[AGENT V2 🧠] Starting Execution. Run: {run_id}, Node: {node_id}", flush=True)

        # DEBUG: 5s Wait to observe animations without LLM call (dev mode only)
        if os.getenv("FLOWX_MODE") == "dev":
            print("[AGENT 🛠️] DEBUG MODE: Waiting 5 seconds...")
            if emit: await emit("node_log", {"nodeId": node_id, "log": "🛠️ DEBUG: Simulation thinking for 5s...\n", "type": "stdout"})
            await asyncio.sleep(5)
            return {"status": "success", "output": {"response": "DEBUG: Thinking complete.", "history": []}}

        # 1. SETUP CLIENT
        api_key = os.getenv("GOOGLE_API_KEY") 
        if not api_key:
            print("[AGENT V2 🔴] Missing GOOGLE_API_KEY", flush=True)
            return {"status": "failed", "output": {"error": "Missing GOOGLE_API_KEY"}}
        client = genai.Client(api_key=api_key)

        # 2. LOAD RUN-SCOPED MEMORY (resets on manual start, shared within restart loop)
        past_memories = await fetch_agent_memory(run_id, node_id)
        
        memory_str = "NO PREVIOUS ATTEMPTS."
        if past_memories:
            memory_str = "HISTORY OF PREVIOUS RUNS (DO NOT REPEAT FAILURES):\n"
            for i, mem in enumerate(past_memories):
                memory_str += f"- Attempt {i+1}: Action '{mem.get('summary')}'. Outcome: {mem.get('outcome')}\n"
        
        print(f"[AGENT V2 🧠] Loaded Memory: {len(past_memories)} entries.", flush=True)
        if emit:
            await emit("node_log", {"nodeId": node_id, "log": f"🔧 System: Init with Run ID [{run_id[-6:]}] - Memories: {len(past_memories)}\n", "type": "stdout"})

        # 3. DYNAMIC CAPABILITY LOADING
        inputs = payload.get("inputs", {})
        allowed_tools = {}     
        tool_definitions = []  
        context_str = ""  # Safe context from non-tool parent nodes
        
        print(f"[AGENT V2 🧠] Loading Tools from {len(inputs)} input nodes...", flush=True)

        for parent_id, parent_data in inputs.items():
            try:
                if not isinstance(parent_data, dict):
                    continue
                output = parent_data.get("output", {})
                
                if isinstance(output, dict) and output.get("type") == "TOOL_DEF":
                    tool_def = output.get("definition")
                    t_name = tool_def["name"]
                    print(f"[AGENT V2 🧠] + Connected Tool: {t_name}", flush=True)
                    
                    if "implementation" in output:
                        allowed_tools[t_name] = output["implementation"]
                        tool_definitions.append(tool_def)
                else:
                    # Safely inject non-tool parent context (truncated to protect token limit)
                    safe_output = _safe_str(output, limit=2000)
                    context_str += f"[Node {parent_id}]: {safe_output}\n"
            except Exception as loop_e:
                print(f"[AGENT V2 ⚠️] Input error for {parent_id}: {loop_e}", flush=True)

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
            "{\"thought\": \"reasoning about the state\", \"action\": \"tool_name\", \"args\": {\"param1\": \"value\"}}\n"
            "OR if done:\n"
            "{\"thought\": \"task completed\", \"action\": \"final_answer\", \"args\": {\"summary\": \"final result\"}}"
        )

        # Include context from parent nodes if any
        user_content = f"CURRENT OBJECTIVE: {self.data.get('prompt')}"
        if context_str:
            user_content = f"--- INCOMING CONTEXT ---\n{context_str}\n{user_content}"

        messages = [
            {"role": "system", "content": system_persona},
            {"role": "user", "content": user_content}
        ]

        # 5. REACT LOOP (Max 5 Steps)
        final_response = ""
        history_log = []
        
        # State tracking for memory save
        run_summary_action = "analysis_only" 
        run_outcome = "completed"
        
        print(f"[AGENT 🧠] Entering Loop (Max {os.getenv('REACT_AGENT_MAX_STEPS', 5)} steps)...")

        ctx_window = int(os.getenv("REACT_AGENT_CTX_WINDOW", 6))  # Max conversation pairs to keep

        for i in range(int(os.getenv("REACT_AGENT_MAX_STEPS", 5))):
            # Rate-limit: wait between successive LLM calls (skip first iteration)
            if i > 0:
                cooldown = float(os.getenv("REACT_AGENT_COOLDOWN", 2))
                await asyncio.sleep(cooldown)

            if emit: await emit("node_log", {"nodeId": node_id, "log": f"\n🤖 [Step {i+1}] Thinking...\n", "type": "stdout"})

            # SLIDING WINDOW: Trim messages to prevent context overflow
            # Always preserve system prompt (index 0) + last N pairs
            if len(messages) > (1 + ctx_window * 2):
                messages = [messages[0]] + messages[-(ctx_window * 2):]
            
            try:
                prompt_text = ""
                for msg in messages:
                    prompt_text += f"{msg['role'].upper()}:\n{msg['content']}\n\n"
                    
                chat = await asyncio.to_thread(
                    client.models.generate_content,
                    model=os.getenv("GOOGLE_MODEL", "gemini-2.5-flash"),
                    contents=prompt_text,
                    config={"temperature": 0.1, "response_mime_type": "application/json"}
                )
            except Exception as e: 
                print(f"[AGENT 🔴] LLM Error: {e}")
                return {"status": "failed", "output": {"error": str(e)}}

            llm_raw = chat.text
            messages.append({"role": "assistant", "content": llm_raw})
            
            decision = extract_json(llm_raw)
            if not isinstance(decision, dict):
                print(f"[AGENT V2 ⚠️] Failed to extract valid JSON dict from LLM output: {llm_raw[:200]}", flush=True)
                messages.append({"role": "user", "content": "Error: Your response must be a valid JSON object, not a string or list. Respond with ONLY a JSON object."})
                continue

            action = decision.get("action")
            args = decision.get("args")
            thought = decision.get("thought")
            print(f"[AGENT 🤔] Thought: {thought}")
            print(f"[AGENT ⚡] Action: {action} ({args})")

            if action != "final_answer":
                run_summary_action = f"{action}({str(args)[:50]})" # Capture main action

            if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"🤔 {thought}\n⚡ {action}('{args}')\n", "type": "stdout"})

            if action == "final_answer":
                final_response = args.get("summary", str(args)) if isinstance(args, dict) else args
                run_outcome = "success"
                print(f"[AGENT ✅] Final Answer Reached.")
                break

            # EXECUTE TOOL (Permission Check)
            if action in allowed_tools:
                try:
                    # Determine if we pass as kwargs or a single positional arg
                    if isinstance(args, dict):
                        tool_output = await asyncio.wait_for(
                            allowed_tools[action](**args) if asyncio.iscoroutinefunction(allowed_tools[action])
                            else asyncio.to_thread(allowed_tools[action], **args),
                            timeout=30
                        )
                    else:
                        tool_output = await asyncio.wait_for(
                            allowed_tools[action](args) if asyncio.iscoroutinefunction(allowed_tools[action])
                            else asyncio.to_thread(allowed_tools[action], args),
                            timeout=30
                        )
                    
                    # --- SIGNAL DETECTION ---
                    if isinstance(tool_output, str) and tool_output.startswith("__FLOWX_SIGNAL__"):
                        signal_type = 'restarting' if 'RESTART' in tool_output else 'stopped'
                        print(f"[AGENT V2 🚨] SIGNAL: {signal_type.upper()}", flush=True)
                        
                        # Emit signal status to frontend
                        if emit:
                            await emit("node_status", {"nodeId": node_id, "status": signal_type})
                            await emit("node_log", {"nodeId": node_id, "log": f"\n🚨 Signal: {signal_type.upper()}\n", "type": "stdout"})
                        
                        # Save memory immediately
                        await append_agent_memory(run_id, node_id, {
                            "summary": _safe_str(run_summary_action, 200),
                            "outcome": f"triggered_{signal_type}",
                            "steps": i+1
                        })

                        return {
                            "status": signal_type,
                            "output": {
                                "response": f"Signal: {signal_type}",
                                "signal": tool_output,
                                "history": history_log
                            }
                        }
                except asyncio.TimeoutError:
                    tool_output = "Error: Tool execution timed out after 30 seconds."
                    print(f"[AGENT ⏱️] Tool '{action}' timed out.")
                except Exception as e:
                    tool_output = f"Execution Panic: {str(e)}"
                    print(f"[AGENT 🔴] Tool Execution Panic: {e}")
            else:
                tool_output = f"Error: Permission Denied. Tool '{action}' is not connected."
                print(f"[AGENT 🚫] Denied Action: {action}")
            
            tool_output_str = _safe_str(tool_output, 2000)
            if emit: await emit("node_log", {"nodeId": self.data.get("id"), "log": f"   -> {tool_output_str[:150]}\n", "type": "stdout"})
            messages.append({"role": "user", "content": f"Tool Output: {tool_output_str}"})
            history_log.append({"step": i+1, "type": "observation", "content": _safe_str(tool_output, 500)})

        # 6. SAVE MEMORY (Standard Completion)
        print(f"[AGENT V2 💾] Saving Memory: {_safe_str(run_summary_action, 100)} -> {run_outcome}", flush=True)
        await append_agent_memory(run_id, node_id, {
            "summary": _safe_str(run_summary_action, 200),
            "outcome": _safe_str(run_outcome, 200),
            "steps": len(history_log)
        })

        return {"status": "success", "output": {"response": final_response, "history": history_log}} 

      except Exception as fatal_e:
        print(f"[AGENT V2 💀] FATAL UNHANDLED ERROR: {fatal_e}", flush=True)
        traceback.print_exc()
        return {"status": "failed", "output": {"error": f"Agent V2 Fatal: {str(fatal_e)}"}}


    def get_execution_mode(self) -> Dict[str, bool]:
        return {"requires_pty": False, "is_interactive": False}

    def get_wait_strategy(self) -> str:
        return "ALL"
