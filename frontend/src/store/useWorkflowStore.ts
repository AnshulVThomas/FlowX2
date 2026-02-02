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
import { fetchWorkflowDetails, deleteWorkflow as apiDeleteWorkflow, saveWorkflow as apiSaveWorkflow, validateWorkflow, executeWorkflow } from '../services/api';

interface WorkflowState {
    // Global Lists
    workflows: Workflow[];
    activeId: string | null;
    isCreatingWorkflow: boolean;

    // ⚡️ ACTIVE EDITOR STATE
    nodes: Node[];
    edges: Edge[];
    isDirty: boolean; // <--- The new source of truth for the active workflow
    validationStatus: Record<string, string>;
    validationErrors: Record<string, string[]>; // NodeID -> List of error messages
    isProcessSidebarOpen: boolean;

    // Actions
    validateGraph: () => Promise<void>;
    executeGraph: () => Promise<void>;
    toggleProcessSidebar: () => void;

    // Editor Actions
    startWorkflowCreation: () => void;
    cancelWorkflowCreation: () => void;
    createWorkflow: (name: string) => Promise<void>;
    setActiveWorkflow: (id: string) => void;

    // Editor Actions
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    addNode: (node: Node) => void;

    // Workflow Management
    deleteWorkflow: (id: string) => Promise<void>;
    updateWorkflowName: (id: string, name: string) => void;
    setWorkflows: (workflows: Workflow[] | WorkflowSummary[]) => void;
    updateNodeData: (id: string, data: Partial<any>, shouldSave?: boolean) => void; // <--- New Action

    // Saving & State
    saveActiveWorkflow: () => Promise<void>;
    markClean: (id?: string) => void; // <--- Re-added for compatibility

    // System Context
    systemContext: any | null;
    setSystemContext: (context: any) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    workflows: [],
    activeId: null,
    isCreatingWorkflow: false,
    nodes: [],
    edges: [],
    isDirty: false,
    validationStatus: {},
    validationErrors: {},
    isProcessSidebarOpen: false,
    systemContext: null,

    setSystemContext: (context) => set({ systemContext: context }),
    toggleProcessSidebar: () => set((state) => ({ isProcessSidebarOpen: !state.isProcessSidebarOpen })),

    startWorkflowCreation: () => set({ isCreatingWorkflow: true }),
    cancelWorkflowCreation: () => set({ isCreatingWorkflow: false }),

    createWorkflow: async (name: string) => {
        const newId = uuidv4();
        const newWorkflow: Workflow = {
            id: newId,
            name: name.trim() || `Workflow ${get().workflows.length + 1}`,
            nodes: [],
            edges: [],
            isDirty: false,
            detailsLoaded: true,
        };

        set((state) => ({
            workflows: [...state.workflows, newWorkflow],
            activeId: newId,
            nodes: [],
            edges: [],
            isDirty: false,
            isCreatingWorkflow: false,
        }));

        try {
            await apiSaveWorkflow(newWorkflow);
        } catch (error) {
            console.error('Failed to auto-save new workflow', error);
        }
    },

    setActiveWorkflow: async (id) => {
        const { workflows } = get();
        const workflow = workflows.find(w => w.id === id);

        if (workflow) {
            set({
                activeId: id,
                nodes: workflow.nodes || [],
                edges: workflow.edges || [],
                isDirty: false // Reset dirty state when switching
            });

            if (!workflow.detailsLoaded) {
                try {
                    const details = await fetchWorkflowDetails(id);
                    set((state) => {
                        const isStillActive = state.activeId === id;
                        return {
                            workflows: state.workflows.map(w =>
                                w.id === id ? { ...details, detailsLoaded: true } : w
                            ),
                            nodes: isStillActive ? details.nodes : state.nodes,
                            edges: isStillActive ? details.edges : state.edges,
                        };
                    });
                } catch (error) {
                    console.error("Failed to load workflow details", error);
                }
            }
        }
    },

    deleteWorkflow: async (id) => {
        try {
            await apiDeleteWorkflow(id);
            set((state) => {
                const newWorkflows = state.workflows.filter(w => w.id !== id);
                let newActiveId = state.activeId;

                // If deleting active workflow, switch to another
                if (state.activeId === id) {
                    newActiveId = newWorkflows.length > 0 ? newWorkflows[0].id : null;
                    const nextW = newWorkflows[0];
                    return {
                        workflows: newWorkflows,
                        activeId: newActiveId,
                        nodes: nextW ? nextW.nodes : [],
                        edges: nextW ? nextW.edges : [],
                        isDirty: false
                    };
                }

                return { workflows: newWorkflows, activeId: newActiveId };
            });
        } catch (error) {
            console.error("Failed to delete workflow", error);
            throw error;
        }
    },

    updateWorkflowName: (id, name) => {
        set((state) => ({
            workflows: state.workflows.map(w => w.id === id ? { ...w, name } : w)
        }));
    },

    onNodesChange: (changes) => {
        const hasRemoval = changes.some(change => change.type === 'remove');
        set((state) => ({
            nodes: applyNodeChanges(changes, state.nodes),
            isDirty: true
        }));
        if (hasRemoval) get().saveActiveWorkflow();
    },

    onEdgesChange: (changes) => {
        const hasRemoval = changes.some(change => change.type === 'remove');
        set((state) => ({
            edges: applyEdgeChanges(changes, state.edges),
            isDirty: true
        }));
        if (hasRemoval) get().saveActiveWorkflow();
    },

    onConnect: (connection) => {
        set((state) => ({
            edges: addEdge(connection, state.edges),
            isDirty: true
        }));
    },

    addNode: (node) => {
        const { nodes } = get();
        if (node.type === 'startNode' && nodes.some(n => n.type === 'startNode')) return;
        set((state) => ({
            nodes: [...state.nodes, node],
            isDirty: true
        }));
    },

    updateNodeData: (id, data, shouldSave = false) => {
        set((state) => ({
            nodes: state.nodes.map((node) => {
                if (node.id === id) {
                    return { ...node, data: { ...node.data, ...data } };
                }
                return node;
            }),
            isDirty: true,
        }));
        if (shouldSave) {
            get().saveActiveWorkflow();
        }
    },

    setWorkflows: (workflows) => {
        const mappedWorkflows: Workflow[] = workflows.map(w => {
            if ('nodes' in w) return { ...w, detailsLoaded: true };
            return { ...w, nodes: [], edges: [], detailsLoaded: false } as Workflow;
        });

        const first = mappedWorkflows[0];
        set({
            workflows: mappedWorkflows,
            activeId: first?.id || null,
            nodes: first?.nodes || [],
            edges: first?.edges || [],
        });

        if (first) get().setActiveWorkflow(first.id);
    },

    saveActiveWorkflow: async () => {
        const { activeId, nodes, edges, workflows } = get();
        if (!activeId) return;

        // Optimized: Don't search full array twice
        const workflowIndex = workflows.findIndex(w => w.id === activeId);
        if (workflowIndex === -1) return;

        const currentMeta = workflows[workflowIndex];
        const workflowToSave: Workflow = { ...currentMeta, nodes, edges };

        try {
            await apiSaveWorkflow(workflowToSave);
            set(state => {
                // Immutable update of just the specific workflow
                const newWorkflows = [...state.workflows];
                newWorkflows[workflowIndex] = workflowToSave;
                return {
                    isDirty: false,
                    workflows: newWorkflows
                };
            });
        } catch (error) {
            console.error('Failed to save workflow', error);
            throw error;
        }
    },

    validateGraph: async () => {
        const { nodes, edges } = get();
        try {
            const result = await validateWorkflow(nodes, edges);
            if (result.status === 'success') {
                const statusMap = result.validation_map || {};
                const errorList = result.errors || [];

                // OPTIMIZATION: Single pass reduce instead of multiple array operations
                const errorMap = errorList.reduce((acc: Record<string, string[]>, err: any) => {
                    if (err.nodeId) {
                        if (!acc[err.nodeId]) acc[err.nodeId] = [];
                        acc[err.nodeId].push(err.message);
                    }
                    return acc;
                }, {} as Record<string, string[]>);

                set({
                    validationStatus: statusMap,
                    validationErrors: errorMap
                });
            }
        } catch (error) {
            console.error("Validation failed", error);
            set({ validationStatus: {} });
        }
    },

    executeGraph: async () => {
        const { activeId, nodes, edges, validationStatus } = get();

        // 1. Validate first? Or assume component did it?
        // Let's assume user handled validation.

        // 2. Prepare Workflow Data
        const workflowData = {
            id: activeId,
            nodes,
            edges
        };

        try {
            const response = await executeWorkflow(workflowData);

            // 3. Update Nodes based on initial response
            // If response is RUNNING/PAUSED, we might have logs or state
            // For now, let's look at the logs to deduce node status
            // Example Log: { node_id: "cmd1", message: "..." }
            // Real-time updates need WebSocket.
            // But if it returns "ATTENTION_REQUIRED" immediately (e.g. paused at start?), we handle it.

            // Just basic handling for Tier 3 verification:
            // If we have logs, update status of those nodes?
            // Actually, executeWorkflow runs the whole graph?
            // If it returns, the graph is likely DONE or PAUSED.

            // Ideally we iterate logs and update nodes
            // But we don't have log parsing logic yet.
            // Minimal: If status is ATTENTION_REQUIRED, find the node that caused it?
            // LangGraph doesn't easily tell us "which node paused" in the root response unless we inspect state.

            // For now, let's just log result to console.
            console.log("Execution Result:", response);

            // Update thread_id on all nodes? Or just keep it loosely?
            // Ideally active thread_id should be stored in Store active state?
            // But our CommandNode takes it from data.thread_id.
            // So we should update ALL nodes with the thread_id?

            const threadId = response.thread_id;

            set(state => ({
                nodes: state.nodes.map(node => ({
                    ...node,
                    data: {
                        ...node.data,
                        thread_id: threadId,
                        execution_status: response.status === 'COMPLETED' ? 'completed' : 'running'
                        // This is a naive update. Real update needs granular node mapping.
                    }
                }))
            }));

        } catch (error) {
            console.error("Execution Failed", error);
            // Optionally set global error state
        }
    },

    markClean: (id) => {
        // If the ID matches the active one (or no ID provided), clean the editor state
        const { activeId } = get();
        if (!id || id === activeId) {
            set({ isDirty: false });
        }
    }
}));