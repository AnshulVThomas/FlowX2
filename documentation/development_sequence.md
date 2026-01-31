# Development Sequence

This document tracks the sequence of tasks completed to build the current system state, as described in `unofficial_flow.md`.

## Project Timeline

**1. Project Exploration**
   - Explored the initial directory structure.
   - Identified the need for a backend Database integration.
   |
   |
   v

**2. Analyze & Plan Backend**
   - Reviewed `backend/main.py` and `docker-compose.yml`.
   - Identified MongoDB is running in Docker.
   - Planned refactoring for better scalability.
   |
   |
   v

**3. Backend Refactoring & MongoDB Integration**
   - **Action**: Created modular folder structure (`database/`, `models/`, `tests/`).
   - **Action**: Implemented `MotorClient` connection in `database/connection.py`.
   - **Action**: Defined `Workflow` Pydantic model in `models/workflow.py`.
   - **Action**: Updated `main.py` to use the new modules and save to MongoDB.
   |
   |
   v

**4. Documentation (Phase 1)**
   - **Action**: Created `documentation/unofficial_flow.md` to document the new architecture and data flow.
   |
   |
   v

**5. Frontend-Backend connection**
   - **Action**: Created `frontend/.env` for API configuration.
   - **Action**: Updated `frontend/src/services/api.ts` to use environment variables.
   - **Action**: Integrated `saveWorkflow` into `StartNode` (Save on Run).
   - **Action**: Verified global Save button functionality.
   |
   |
   v

**6. Real-time Status Implementation**
   - **Action**: Added `/ws` WebSocket endpoint to `backend/main.py`.
   - **Action**: Created `frontend/src/hooks/useServerStatus.ts` for health checks.
   - **Action**: Updated `Navbar` to display a live "Online/Offline" indicator.
   |
   |
   v

**7. Workflow Retrieval Strategy**
   - **Action**: Added `GET /workflows` endpoint to `backend/main.py`.
   - **Action**: Updated `POST /workflows` to `upsert` (avoid duplicate saves).
   - **Action**: Added `fetchWorkflows` to `frontend/src/services/api.ts`.
   - **Action**: Added `setWorkflows` to `useWorkflowStore`.
   - **Action**: Configured `App.tsx` to fetch workflows when WebSocket connects.
   |
   |
   v

**8. Verification**
   - **Fixed**: Canvas resize bug by removing `fitView`.
   - Ran `backend/tests/test_workflow_api.py`.
   - Verified Frontend UI indicators and data persistence.

   |
   |
   v

**9. Editor & Layout Refactor**
   - **Action**: Implemented multi-workflow Tabs in `Navbar` with "bleed-in" input for creating/renaming.
   - **Action**: Refactored `Sidebar` and `Canvas` interaction.
   - **Action**: Cleaned up Store state (`activeId`, `workflows`, `isCreatingWorkflow`).
   |
   |
   v

**10. Node & Data Management**
   - **Action**: Implemented **Auto-Save** on node/edge changes and deletions.
   - **Action**: Supported `Delete` key for removing selected nodes.
   - **Action**: Added **Dynamic Styling** to `StartNode` (Border/Ring colors based on Idle/Running status).
   - **Action**: Implemented `activeWorkflow` dirty state tracking for UI feedback.
   |
   |
   v

**11. Performance Optimization**
   - **Critical Fix**: Resolved Infinite Loop in `Navbar` selector by stabilizing object references.
   - **Action**: Refactored `useWorkflowStore` to separate data/action selectors.
   - **Action**: Enabled `onlyRenderVisibleElements` in Canvas for massive drag performance gain.
   - **Action**: Memoized `StartNode` to prevent re-renders during interactions.
   - **Action**: Removed `React.StrictMode` in development to reduce double-render overhead.
   |
   |
   v

**12. System Context Module (Tier 1)**
   - **Action**: Created `backend/app/core/system.py` to auto-detect OS info (Distro, Kernel, Shell, Hardware).
   - **Action**: Exposed `GET /system-info` endpoint in `backend/main.py`.
   - **Action**: Verified JSON output match against host environment.
   |
   |
   v

**13. Intelligence Layer (Tier 2)**
   - **Action**: Structured backend into `app/core`, `app/services`, and `app/schemas`.
   - **Action**: Implemented Gemini integration in `app/services/generator.py`.
   - **Action**: Defined strict `UIResponse` contract in `app/schemas/command.py` for frontend rendering.
   |
   |
   v

**14. Presentation Layer & Command Node (Tier 3)**
   - **Action**: Created `CommandNode.tsx` with inputs, settings, and output display.
   - **Architecture**: Implemented **Global Fetch -> Store -> Local Clone** pattern for System Context.
   - **Action**: Integrated `fetchSystemInfo` and `generateCommand` APIs.
   - **Action**: Added **Data Persistence** for node prompts, outputs, and context overrides.
   - **Action**: Implemented "Reset to Live" and "Settings" override features.

**15. Safety Lock & Impact Analysis (Tier 3.5)**
   - **Action**: Updated `CommandNodeOutput` schema to strictly separate "Explanation" vs "System Impact".
   - **Action**: Implemented **Risk Assessment Logic** (SAFE/CAUTION/CRITICAL) in backend.
   - **Action**: Created **Safety Lock** in Frontend; high-risk commands engage a "Locked" state requiring manual override.
   - **Action**: Added color-coded badges (Green/Yellow/Red) and warning panels for critical operations.
