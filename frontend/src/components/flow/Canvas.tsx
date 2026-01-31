import { useCallback, useRef } from 'react';
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
import { useEffect } from 'react';
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

    // Initial system info fetch
    const systemInfoRef = useRef<any>(null);

    useEffect(() => {
        fetchSystemInfo().then((info: any) => {
            systemInfoRef.current = info;
            console.log("System info loaded:", info);
        }).catch((err: any) => console.error("Failed to load system info", err));
    }, []);

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
                // INJECT SYSTEM INFO HERE
                console.log("Injecting system context:", systemInfoRef.current);
                data = {
                    command: '',
                    prompt: '',
                    system_context: systemInfoRef.current
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
        [screenToFlowPosition, addNode],
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