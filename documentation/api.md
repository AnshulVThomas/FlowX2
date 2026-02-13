# FlowX2 API Documentation (v3.0)

For full OpenAPI spec, visit `/docs` when the backend is running.

## Workflow Execution

### `POST /api/v1/workflow/execute`
Starts a new workflow run.

#### Payload
```json
{
  "id": "workflow-uuid",
  "nodes": [...],
  "edges": [...],
  "sudo_password": "optional-system-password" 
}
```

- **sudo_password**: (Optional) If provided, it's used to authorize Sudo Lock execution.

#### Response
```json
{
  "thread_id": "execution-uid",
  "status": "COMPLETED",
  "logs": [],
  "results": {...}
}
```

### `POST /api/v1/workflow/resume/{thread_id}`
Resumes a crashed or stopped workflow from its last known state.

#### Payload
```json
{
  "workflowId": "workflow-uuid",
  "sudo_password": "optional-system-password"
}
```

- **Logic**: Fetches `results` from MongoDB for the given `thread_id`. Any completed nodes are skipped in the re-run.

## Command Generation

### `POST /generate-command`
Uses Gemini AI to generate a bash command from natural language.

#### Payload
```json
{
  "prompt": "Install Docker",
  "node_id": "node-uuid",
  "system_context": "Arch Linux 6.1"
}
```

#### Response
```json
{
  "node_id": "...",
  "ui_render": {
    "title": "Install Docker using Pacman",
    "code_block": "sudo pacman -S docker",
    "badge_color": "yellow", // Risk Level
    "description": "..."
  }
}
```
