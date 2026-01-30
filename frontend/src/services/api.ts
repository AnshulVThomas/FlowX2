import type { Workflow } from '../store/useWorkflowStore';

const API_URL = import.meta.env.VITE_API_URL //|| 'http://localhost:8000';

export const saveWorkflow = async (workflow: Workflow) => {
    try {
        const response = await fetch(`${API_URL}/workflows`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
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
