# FlowX2: The Self-Healing Workflow Engine

## Overview
FlowX2 is a high-performance, async-first workflow automation platform for Linux. It combines a visual node-based editor with a powerful **Push-Based Async Execution Engine**.

### 🌟 New in v5.1: The Thinking Agent

FlowX2 now features an autonomous **ReAct Agent** ("The Brain") that can:
-   **Analyze** workflow failures in real-time.
-   **Execute** corrective commands via the `ShellTool`.
-   **Decide** to **Restart** the workflow to verify fixes.
-   **Remember** past attempts using MongoDB, preventing infinite loops.

---

## 📚 Documentation

Detailed documentation is available in the `documentation/` directory:

-   [**Master Documentation**](documentation/PROJECT_MASTER_DOC.md): Complete architecture overview.
-   [**Agent Walkthrough**](file:///home/noir/.gemini/antigravity/brain/46c7de02-6b5b-4b8c-99b0-1a387a9f0924/walkthrough.md): Step-by-step guide to using the Agent.
-   [**Plugin Theme**](plugins/THEME.md): Design system for custom nodes.

## quick Start

1.  **Configure**: Copy `.env.example` to `.env` and add your `GROQ_API_KEY`.
2.  **Run**:
    ```bash
    python3 backend/main.py
    ```
3.  **Access**: Open `http://localhost:5173`.
