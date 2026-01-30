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
import '@xyflow/react/dist/style.css';
import { useShallow } from 'zustand/react/shallow';

const nodeTypes = {
    startNode: StartNode,
};

export function Canvas() {
    const reactFlowWrapper = useRef(null);
    const { screenToFlowPosition } = useReactFlow();

    // ⚡️ FAST: Direct selection from root state.
    // No .find(), no complex object comparison.
    const nodes = useWorkflowStore(useShallow((state) => state.nodes));
    const edges = useWorkflowStore(useShallow((state) => state.edges));
    const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
    const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
    const onConnect = useWorkflowStore((state) => state.onConnect);
    const addNode = useWorkflowStore((state) => state.addNode);

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

            // Default data for startNode
            const data = type === 'startNode'
                ? { name: 'Start Workflow', status: 'idle', label: 'Start Workflow' }
                : { label: 'Node' };

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