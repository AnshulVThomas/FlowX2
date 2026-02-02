import type { Workflow, WorkflowSummary } from '../types';

const API_URL = import.meta.env.VITE_API_URL //|| 'http://localhost:8000';

export const saveWorkflow = async (workflow: Workflow) => {
    try {
        const response = await fetch(`${API_URL}/workflows`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: workflow.id,
                name: workflow.name,
                data: {
                    nodes: workflow.nodes,
                    edges: workflow.edges,
                },
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to save workflow');
        }

        return await response.json();
    } catch (error) {
        console.error('Error saving workflow:', error);
        throw error;
    }
};

export const fetchWorkflows = async (): Promise<WorkflowSummary[]> => {
    try {
        const response = await fetch(`${API_URL}/workflows`);
        if (!response.ok) {
            throw new Error('Failed to fetch workflows');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching workflows:', error);
        throw error;
    }
};

export const fetchWorkflowDetails = async (id: string): Promise<Workflow> => {
    try {
        const response = await fetch(`${API_URL}/workflows/${id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch workflow details');
        }
        const data = await response.json();

        // Transform backend data format back to frontend Workflow interface
        return {
            id: data.id,
            name: data.name,
            nodes: data.data?.nodes || [],
            edges: data.data?.edges || []
        };
    } catch (error) {
        console.error('Error fetching workflow details:', error);
        throw error;
    }
};

export const deleteWorkflow = async (id: string) => {
    try {
        const response = await fetch(`${API_URL}/workflows/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to delete workflow');
        }

        return await response.json();
    } catch (error) {
        console.error('Error deleting workflow:', error);
        throw error;
    }
};

export interface GenerateCommandResponse {
    node_id: string;
    status: string;
    ui_render: {
        title: string;
        code_block: string;
        language: string;
        badge_color: string;
        description: string;
        system_effect: string;
    };
    execution_metadata?: {
        requires_sudo: boolean;
        is_interactive: boolean;
    };
}

export const fetchSystemInfo = async () => {
    try {
        const response = await fetch(`${API_URL}/system-info`);
        if (!response.ok) {
            throw new Error('Failed to fetch system info');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching system info:', error);
        throw error;
    }
};

export const generateCommand = async (prompt: string, nodeId: string, systemContext?: any): Promise<GenerateCommandResponse> => {
    try {
        const response = await fetch(`${API_URL}/generate-command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                node_id: nodeId,
                system_context: systemContext
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.detail || errorData.error || 'Failed to generate command';
            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (error) {
        console.error('Error generating command:', error);
        throw error;
    }
};

export const validateWorkflow = async (nodes: any[], edges: any[]) => {
    try {
        const response = await fetch(`${API_URL}/workflow/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ nodes, edges }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Validation request failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Error validating workflow:', error);
        throw error;
    }
};

export interface ExecutionResponse {
    thread_id: string;
    status: "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "ATTENTION_REQUIRED";
    logs: any[];
    error?: string;
    results?: Record<string, any>;
}

export const executeWorkflow = async (workflow: any): Promise<ExecutionResponse> => {
    try {
        const response = await fetch(`${API_URL}/api/v1/workflow/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(workflow),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || err.error || 'Execution failed');
        }
        return await response.json();
    } catch (error) {
        console.error('Error executing workflow:', error);
        throw error;
    }
};

export const resumeWorkflow = async (threadId: string, workflowId: string, sudoPassword?: string): Promise<ExecutionResponse> => {
    try {
        const response = await fetch(`${API_URL}/api/v1/workflow/resume/${threadId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workflowId,
                sudo_password: sudoPassword
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || err.error || 'Resume failed');
        }
        return await response.json();
    } catch (error) {
        console.error('Error resuming workflow:', error);
        throw error;
    }
};
