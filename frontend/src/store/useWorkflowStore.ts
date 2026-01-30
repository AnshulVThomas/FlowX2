import { create } from 'zustand';
import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import type { Workflow, WorkflowSummary } from '../types';
import { fetchWorkflowDetails, deleteWorkflow as apiDeleteWorkflow } from '../services/api';

interface WorkflowState {
    workflows: Workflow[];
    activeId: string | null;
    createWorkflow: () => void;
    setActiveWorkflow: (id: string) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    deleteWorkflow: (id: string) => Promise<void>;
    updateWorkflowName: (id: string, name: string) => void;
    addNode: (node: Node) => void;
    setWorkflows: (workflows: Workflow[]) => void;
}


const initialWorkflowId = uuidv4();

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    workflows: [
        {
            id: initialWorkflowId,
            name: 'Workflow 1',
            nodes: [],
            edges: [],
        },
    ],
    activeId: initialWorkflowId,

    createWorkflow: () => {
        const newId = uuidv4();
        const newWorkflow: Workflow = {
            id: newId,
            name: `Workflow ${get().workflows.length + 1} `,
            nodes: [],
            edges: [],
        };
        set((state) => ({
            workflows: [...state.workflows, newWorkflow],
            activeId: newId,
        }));
    },

    setActiveWorkflow: async (id) => {
        const { workflows } = get();
        const workflow = workflows.find(w => w.id === id);

        if (workflow && !workflow.detailsLoaded) {
            try {
                // Fetch full details
                const details = await fetchWorkflowDetails(id);
                // Update store
                set((state) => ({
                    workflows: state.workflows.map(w =>
                        w.id === id ? { ...details, detailsLoaded: true } : w
                    ),
                    activeId: id
                }));
            } catch (error) {
                console.error("Failed to load workflow details", error);
                // Optionally handle error state
            }
        } else {
            set({ activeId: id });
        }
    },

    deleteWorkflow: async (id) => {
        try {
            await apiDeleteWorkflow(id);
            set((state) => {
                const newWorkflows = state.workflows.filter(w => w.id !== id);
                // If we deleted the active one, switch to the first available, or null if none
                let newActiveId = state.activeId;
                if (state.activeId === id) {
                    newActiveId = newWorkflows.length > 0 ? newWorkflows[0].id : null;
                }
                return { workflows: newWorkflows, activeId: newActiveId };
            });
        } catch (error) {
            console.error("Failed to delete workflow", error);
            throw error; // Let component handle UI feedback
        }
    },

    updateWorkflowName: (id, name) => {
        set((state) => ({
            workflows: state.workflows.map(w => w.id === id ? { ...w, name } : w)
        }));
    },

    onNodesChange: (changes) => {
        set((state) => {
            const { activeId, workflows } = state;
            if (!activeId) return state;

            return {
                workflows: workflows.map((w) => {
                    if (w.id === activeId) {
                        return {
                            ...w,
                            nodes: applyNodeChanges(changes, w.nodes),
                        };
                    }
                    return w;
                }),
            };
        });
    },

    onEdgesChange: (changes) => {
        set((state) => {
            const { activeId, workflows } = state;
            if (!activeId) return state;

            return {
                workflows: workflows.map((w) => {
                    if (w.id === activeId) {
                        return {
                            ...w,
                            edges: applyEdgeChanges(changes, w.edges),
                        };
                    }
                    return w;
                }),
            };
        });
    },

    onConnect: (connection) => {
        set((state) => {
            const { activeId, workflows } = state;
            if (!activeId) return state;

            return {
                workflows: workflows.map((w) => {
                    if (w.id === activeId) {
                        return {
                            ...w,
                            edges: addEdge(connection, w.edges),
                        };
                    }
                    return w;
                }),
            };
        });
    },

    addNode: (node) => {
        set((state) => {
            const { activeId, workflows } = state;
            if (!activeId) return state;

            // Check if attempting to add startNode when one already exists
            const activeWorkflow = workflows.find(w => w.id === activeId);
            if (activeWorkflow && node.type === 'startNode') {
                const hasStartNode = activeWorkflow.nodes.some(n => n.type === 'startNode');
                if (hasStartNode) {
                    return state; // Prevent adding another start node
                }
            }

            return {
                workflows: workflows.map((w) => {
                    if (w.id === activeId) {
                        return {
                            ...w,
                            nodes: [...w.nodes, node],
                        };
                    }
                    return w;
                }),
            };
        });
    },

    setWorkflows: (workflows: Workflow[] | WorkflowSummary[]) => {
        // Map summaries to full objects (initially empty nodes/edges if summary)
        const mappedWorkflows: Workflow[] = workflows.map(w => {
            if ('nodes' in w) {
                // It's already a full Workflow
                return { ...w, detailsLoaded: true };
            } else {
                // It's a summary
                return {
                    id: w.id,
                    name: w.name,
                    nodes: [],
                    edges: [],
                    detailsLoaded: false
                };
            }
        });

        set({
            workflows: mappedWorkflows,
            activeId: mappedWorkflows.length > 0 ? mappedWorkflows[0].id : null
        });

        // If there is an active workflow, ensure its details are loaded
        if (mappedWorkflows.length > 0) {
            get().setActiveWorkflow(mappedWorkflows[0].id);
        }
    },
}));

