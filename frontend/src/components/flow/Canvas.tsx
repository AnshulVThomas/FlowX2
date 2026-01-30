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
import { useShallow } from 'zustand/react/shallow';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { v4 as uuidv4 } from 'uuid';
import { StartNode } from '../../nodes/StartNode';
import '@xyflow/react/dist/style.css';

const nodeTypes = {
    startNode: StartNode,
};

export function Canvas() {
    const reactFlowWrapper = useRef(null);
    const { screenToFlowPosition } = useReactFlow();

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
    } = useWorkflowStore(
        useShallow((state) => {
            const activeWorkflow = state.workflows.find((w) => w.id === state.activeId);
            return {
                nodes: activeWorkflow?.nodes || [],
                edges: activeWorkflow?.edges || [],
                onNodesChange: state.onNodesChange,
                onEdgesChange: state.onEdgesChange,
                onConnect: state.onConnect,
                addNode: state.addNode,
            };
        })
    );

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
                fitView
            >
                <Controls />
                <MiniMap />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
        </div>
    );
}
