import { useWorkflowStore } from "../../store/useWorkflowStore";
import { Play } from "lucide-react";

export function Sidebar() {
    const { workflows, activeId } = useWorkflowStore();

    // Find active workflow's nodes to check if we already have a START node
    const activeWorkflow = workflows.find(w => w.id === activeId);
    // Check for 'startNode' type now
    const hasStartNode = activeWorkflow?.nodes.some(node => node.type === 'startNode');

    const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
        event.dataTransfer.setData('application/reactflow/type', nodeType);
        event.dataTransfer.setData('application/reactflow/label', label);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside className="w-64 bg-black/40 backdrop-blur-md border-r border-white/10 p-4 flex flex-col gap-4 z-40 h-full">
            <div className="text-sm font-semibold text-gray-400 mb-2">Nodes</div>

            <div
                className={`
                    flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 transition-all
                    ${hasStartNode
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-grab hover:bg-white/10 hover:border-white/20 active:cursor-grabbing'
                    }
                `}
                onDragStart={(event) => !hasStartNode && onDragStart(event, 'startNode', 'Start Workflow')}
                draggable={!hasStartNode}
            >
                <div className="p-2 rounded bg-blue-500/20 text-blue-400">
                    <Play size={20} />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Start Node</span>
                    <span className="text-xs text-gray-500">Entry point</span>
                </div>
            </div>
        </aside>
    );
}
