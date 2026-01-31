import { useCallback, useEffect, useRef } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    BackgroundVariant,
    useReactFlow,
    Position,
} from '@xyflow/react';
// Note: useShallow is no longer strictly needed for nodes/edges 
// because we are selecting the root state directly!
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { v4 as uuidv4 } from 'uuid';
import { StartNode } from '../../nodes/StartNode';
import { CommandNode } from '../../nodes/CommandNode';
import { fetchSystemInfo } from '../../services/api';

import '@xyflow/react/dist/style.css';

const nodeTypes = {
    startNode: StartNode,
    commandNode: CommandNode,
};

export function Canvas() {
    const reactFlowWrapper = useRef(null);
    const { screenToFlowPosition } = useReactFlow();

    // ⚡️ FAST: Direct selection from root state.
    // No .find(), no complex object comparison.
    const nodes = useWorkflowStore((state) => state.nodes);
    const edges = useWorkflowStore((state) => state.edges);
    const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
    const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
    const onConnect = useWorkflowStore((state) => state.onConnect);
    const addNode = useWorkflowStore((state) => state.addNode);
    const setSystemContext = useWorkflowStore((state) => state.setSystemContext);
    const systemContext = useWorkflowStore((state) => state.systemContext);

    useEffect(() => {
        // Only fetch if we haven't already (or force it if needed, but on app load once is fine)
        if (!systemContext) {
            fetchSystemInfo().then((info: any) => {
                setSystemContext(info);
                console.log("System info loaded into Store:", info);
            }).catch((err: any) => console.error("Failed to load system info", err));
        }
    }, [systemContext, setSystemContext]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow/type');

            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Default data for nodes
            let data: any = { label: 'Node' };
            if (type === 'startNode') {
                data = { name: 'Start Workflow', status: 'idle', label: 'Start Workflow' };
            } else if (type === 'commandNode') {
                // INJECT SYSTEM INFO HERE (DEEP COPY from Store)
                console.log("Injecting system context from Store:", systemContext);
                data = {
                    command: '',
                    prompt: '',
                    history: [],
                    system_context: systemContext ? structuredClone(systemContext) : {}
                };
            }

            const newNode = {
                id: uuidv4(),
                type,
                position,
                data,
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
            };

            addNode(newNode);
        },
        [screenToFlowPosition, addNode, systemContext],
    );

    return (
        <div className="flex-grow h-full" ref={reactFlowWrapper}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                deleteKeyCode="Delete"
                multiSelectionKeyCode="Shift"
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectNodesOnDrag={false}
                onlyRenderVisibleElements={true}
            >
                <Controls />
                <MiniMap />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
        </div>
    );
}