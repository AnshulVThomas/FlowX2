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

export interface Workflow {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
}

interface WorkflowState {
    workflows: Workflow[];
    activeId: string | null;
    createWorkflow: () => void;
    setActiveWorkflow: (id: string) => void;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    deleteWorkflow: (id: string) => void;
    updateWorkflowName: (id: string, name: string) => void;
}

const initialWorkflowId = uuidv4();

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    workflows: [
        {
            id: initialWorkflowId,
            name: 'Workflow 1',
            nodes: [
                { id: '1', position: { x: 100, y: 100 }, data: { label: 'Start Node' } },
            ],
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

    setActiveWorkflow: (id) => {
        set({ activeId: id });
    },

    deleteWorkflow: (id) => {
        set((state) => {
            const newWorkflows = state.workflows.filter(w => w.id !== id);
            // If we deleted the active one, switch to the first available, or null if none
            let newActiveId = state.activeId;
            if (state.activeId === id) {
                newActiveId = newWorkflows.length > 0 ? newWorkflows[0].id : null;
            }
            return { workflows: newWorkflows, activeId: newActiveId };
        });
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
}));
