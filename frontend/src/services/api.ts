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

export const fetchWorkflows = async (): Promise<Workflow[]> => {
    try {
        const response = await fetch(`${API_URL}/workflows`);
        if (!response.ok) {
            throw new Error('Failed to fetch workflows');
        }
        const data = await response.json();

        // Transform backend data format back to frontend Workflow interface
        // Backend stores nodes/edges in 'data' field, frontend expects flat structure
        return data.map((item: any) => ({
            id: item.id,
            name: item.name,
            nodes: item.data?.nodes || [],
            edges: item.data?.edges || []
        }));
    } catch (error) {
        console.error('Error fetching workflows:', error);
        throw error;
    }
};
