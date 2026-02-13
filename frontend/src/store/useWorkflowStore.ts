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
import { fetchWorkflowDetails, deleteWorkflow as apiDeleteWorkflow, saveWorkflow as apiSaveWorkflow, validateWorkflow, executeWorkflow, cancelWorkflow } from '../services/api';

interface WorkflowState {
    // Global Lists
    workflows: Workflow[];
    activeThreadId: string | null; // Track execution thread

    // State
    activeId: string | null;
    nodes: Node[];
    edges: Edge[];
    isDirty: boolean;
    isCreatingWorkflow: boolean;
    validationStatus: Record<string, string>;
    validationErrors: Record<string, string[]>;
    isProcessSidebarOpen: boolean;

    // Actions
    validateGraph: () => Promise<void>;
    executeGraph: (sudoPassword?: string) => Promise<void>;
    abortWorkflow: () => Promise<void>;
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
    toggleEdgeType: (edgeId: string) => void;

    // Saving & State
    saveActiveWorkflow: () => Promise<void>;
    markClean: (id?: string) => void; // <--- Re-added for compatibility

    // System Context
    systemContext: any | null;
    setSystemContext: (context: any) => void;

    // Connectivity
    connectGlobalSocket: () => void;
}

// Singleton to prevent double-connections in Strict Mode
let globalSocket: WebSocket | null = null;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    workflows: [],
    activeId: null,
    activeThreadId: null,
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
        const newEdge = {
            ...connection,
            id: uuidv4(),
            type: 'default',
            data: { behavior: 'conditional' },
            style: { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 }, // Default: Green Dashed
            animated: false,
        } as Edge;
        set((state) => ({
            edges: addEdge(newEdge, state.edges),
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

    toggleEdgeType: (edgeId: string) => {
        set((state) => ({
            edges: state.edges.map((edge) => {
                if (edge.id !== edgeId) return edge;

                const isCurrentlyConditional = edge.data?.behavior !== 'force' && edge.data?.behavior !== 'failure';
                const isForce = edge.data?.behavior === 'force';

                // Cycle: Conditional -> Force -> Failure -> Conditional
                let newBehavior = 'conditional';
                if (isCurrentlyConditional) newBehavior = 'force';
                else if (isForce) newBehavior = 'failure';

                let style = { stroke: '#22c55e', strokeDasharray: '5,5', strokeWidth: 2 }; // Default: Conditional Dashed

                if (newBehavior === 'force') {
                    style = { stroke: '#f59e0b', strokeDasharray: '0', strokeWidth: 2 }; // Orange Solid
                } else if (newBehavior === 'failure') {
                    style = { stroke: '#ef4444', strokeDasharray: '5,5', strokeWidth: 2 }; // Red Dashed
                }

                return {
                    ...edge,
                    type: 'default',
                    data: { ...edge.data, behavior: newBehavior },
                    style: style,
                    label: undefined,
                    labelStyle: undefined
                };
            }),
            isDirty: true
        }));
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

    executeGraph: async (sudoPassword?: string) => {
        const { activeId, nodes, edges } = get();

        // 1. Validate first? Or assume component did it?
        // Let's assume user handled validation.

        // --- 1. RESET STATE (The Fix) ---
        // Clear status, logs, and thread_id for ALL nodes before starting.
        // This ensures nodes that aren't reached in this run don't keep old colors.
        const resetNodes = nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                execution_status: undefined, // Removes Green/Red Border
                thread_id: undefined,        // Unlinks old thread
                logs: [],                    // Clears internal log buffer
                // Note: We PRESERVE 'command', 'prompt', 'history'
            }
        }));

        // Apply reset immediately to UI
        set({ nodes: resetNodes });

        // --- 2. PREPARE PAYLOAD ---
        const workflowData = {
            id: activeId,
            nodes: resetNodes, // Send clean state
            edges
        };

        try {
            const response = await executeWorkflow(workflowData, sudoPassword);

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
            const nodeResults = response.results || {};

            set(state => ({
                activeThreadId: threadId, // Track for cancellation
                nodes: state.nodes.map(node => {
                    const result = nodeResults[node.id];
                    let newStatus = node.data.execution_status;

                    if (result) {
                        newStatus = result.status === 'success' ? 'completed' : 'failed';
                    } else if (response.status === 'COMPLETED') {
                        // If no specific result but workflow done, assume completed? 
                        // Or keep as is? Better to only update if we have a result 
                        // or if we are resetting. 
                        // For now, if we have a result, use it.
                        // If not, and workflow is done, maybe it didn't run? (e.g. branch skipped)
                    }

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            thread_id: threadId,
                            execution_status: newStatus,
                            // Optionally store exit code if needed
                        }
                    }
                })
            }));

        } catch (error: any) {
            console.error("Execution Failed", error);

            // Handle Validation Errors form Backend (Tier 3)
            // Backend returns { detail: [{ nodeId, message, level }] }
            if (error.detail && Array.isArray(error.detail)) {
                console.log("Parsing Validation Errors from Execution Attempt...");

                const errorMap = error.detail.reduce((acc: Record<string, string[]>, err: any) => {
                    if (err.nodeId && err.nodeId !== 'global') {
                        if (!acc[err.nodeId]) acc[err.nodeId] = [];
                        acc[err.nodeId].push(err.message);
                    }
                    return acc;
                }, {} as Record<string, string[]>);

                const statusMap = Object.keys(errorMap).reduce((acc, id) => {
                    acc[id] = 'VALIDATION_FAILED';
                    return acc;
                }, {} as Record<string, string>);

                set({
                    validationErrors: errorMap,
                    validationStatus: statusMap
                });
            }
        }
    },

    abortWorkflow: async () => {
        const { activeThreadId } = get();
        if (!activeThreadId) {
            console.warn("No active execution to cancel");
            return;
        }

        try {
            await cancelWorkflow(activeThreadId);
            // We expect the backend to eventually return/cancel the executeGraph call,
            // or we receive a socket event. 
            // For immediate UI feedback, we can set status to 'cancelled' if we tracked it globally.
            // But let's rely on the socket 'node_status' event for now.
        } catch (error) {
            console.error("Failed to abort workflow", error);
        }
    },

    markClean: (id) => {
        // If the ID matches the active one (or no ID provided), clean the editor state
        const { activeId } = get();
        if (!id || id === activeId) {
            set({ isDirty: false });
        }
    },

    connectGlobalSocket: () => {
        // 1. Singleton Check
        if (globalSocket && (globalSocket.readyState === WebSocket.OPEN || globalSocket.readyState === WebSocket.CONNECTING)) {
            console.log("Global Socket already active.");
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = '8000';
        const wsUrl = `${protocol}//${host}:${port}/ws/workflow`;

        console.log("Connecting to Global Workflow Socket:", wsUrl);
        const ws = new WebSocket(wsUrl);
        globalSocket = ws; // Assign singleton

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                console.log("[FRONTEND] WS Message:", msg.type, msg.data);

                // REACTIVE STATE UPDATES
                if (msg.type === "node_status") {
                    const { nodeId, status, thread_id } = msg.data;

                    set(state => ({
                        activeThreadId: thread_id || state.activeThreadId, // Sync global active thread if provided
                        nodes: state.nodes.map(n => {
                            if (n.id === nodeId) {
                                let newData: any = {
                                    ...n.data,
                                    execution_status: status,
                                    thread_id: thread_id || n.data.thread_id // Sync node thread
                                };

                                // Auto-Update History on Completion
                                if (status === 'completed' || status === 'failed') {
                                    const historyItem = {
                                        prompt: n.data.prompt || "Workflow Execution",
                                        command: n.data.command,
                                        timestamp: Date.now(),
                                        type: 'executed',
                                        runType: 'workflow',
                                        status: status === 'completed' ? 'success' : 'failure'
                                    };
                                    // Append and keep last 5
                                    const currentHistory = (n.data.history as any[]) || [];
                                    newData = {
                                        ...newData,
                                        history: [historyItem, ...currentHistory].slice(0, 5)
                                    };
                                }
                                return { ...n, data: newData };
                            }
                            return n;
                        })
                    }));
                }

                // RELAY LOGS TO COMPONENTS (Event Bus Pattern)
                if (msg.type === "node_log") {
                    const { nodeId, log, type, thread_id } = msg.data;

                    // 1. Dispatch for Realtime (Active Listeners)
                    window.dispatchEvent(new CustomEvent(`node-log-${nodeId}`, {
                        detail: { log, type }
                    }));

                    // 2. Persist in Store (Buffered Rehydration)
                    set(state => ({
                        activeThreadId: thread_id || state.activeThreadId, // Sync global active thread
                        nodes: state.nodes.map(n => {
                            if (n.id === nodeId) {
                                // Append log to existing buffer
                                const currentLogs = (n.data as any).logs || [];
                                return {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        logs: [...currentLogs, log],
                                        thread_id: thread_id || n.data.thread_id // Sync node thread
                                    }
                                };
                            }
                            return n;
                        })
                    }));
                }

                // HANDLE SUDO / INTERRUPT REQUESTS
                if (msg.type === "interrupt") {
                    const { nodeId, thread_id } = msg.data;
                    set(state => ({
                        nodes: state.nodes.map(n =>
                            n.id === nodeId
                                ? { ...n, data: { ...n.data, execution_status: 'attention_required', thread_id: thread_id } }
                                : n
                        )
                    }));
                    // Open the Resume Overlay automatically?
                    // The UI should react to 'attention_required' status.
                }

                // Append logs to visual history? 
                // That might be expensive if many logs. 
                // For now, we rely on TerminalComponent for live viewing.

            } catch (e) {
                console.error("Global Socket Parse Error", e);
            }
        };

        ws.onopen = () => console.log("Global Socket Connected");
        ws.onerror = (e) => console.error("Global Socket Error", e);
    }
}));