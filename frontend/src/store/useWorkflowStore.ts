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
import { fetchWorkflowDetails, deleteWorkflow as apiDeleteWorkflow, saveWorkflow } from '../services/api';

interface WorkflowState {
    workflows: Workflow[];
    activeId: string | null;
    isCreatingWorkflow: boolean;
    startWorkflowCreation: () => void;
    cancelWorkflowCreation: () => void;
    createWorkflow: (name: string) => Promise<void>;
    setActiveWorkflow: (id: string) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    deleteWorkflow: (id: string) => Promise<void>;
    updateWorkflowName: (id: string, name: string) => void;
    addNode: (node: Node) => void;
    setWorkflows: (workflows: Workflow[] | WorkflowSummary[]) => void;
    markClean: (id: string) => void;
    isWorkflowDirty: (id: string) => boolean;
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
    isCreatingWorkflow: false,

    startWorkflowCreation: () => {
        set({ isCreatingWorkflow: true });
    },

    cancelWorkflowCreation: () => {
        set({ isCreatingWorkflow: false });
    },

    createWorkflow: async (name: string) => {
        const newId = uuidv4();
        const newWorkflow: Workflow = {
            id: newId,
            name: name.trim() || `Workflow ${get().workflows.length + 1}`,
            nodes: [],
            edges: [],
            isDirty: false,
            detailsLoaded: true, // New workflow has all data already
        };
        set((state) => ({
            workflows: [...state.workflows, newWorkflow],
            activeId: newId,
            isCreatingWorkflow: false,
        }));

        // Auto-save to database
        try {
            await saveWorkflow(newWorkflow);
        } catch (error) {
            console.error('Failed to auto-save new workflow', error);
        }
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
            workflows: state.workflows.map(w => w.id === id ? { ...w, name, isDirty: true } : w)
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
                            isDirty: true,
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
                            isDirty: true,
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
                            isDirty: true,
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
                            isDirty: true,
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

    markClean: (id) => {
        set((state) => ({
            workflows: state.workflows.map(w => w.id === id ? { ...w, isDirty: false } : w)
        }));
    },

    isWorkflowDirty: (id) => {
        const workflow = get().workflows.find(w => w.id === id);
        return workflow?.isDirty ?? false;
    },
}));

