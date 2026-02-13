import { useWorkflowStore } from "../../store/useWorkflowStore";
import { Play, Sparkles } from "lucide-react";
import { memo } from "react";

// Optimization: Memoize the component
export const Sidebar = memo(() => {
    // ⚡️ OPTIMIZED: Check the live 'nodes' array directly.
    // This removes the heavy .find() on the workflows array.
    // Optimization: Zustand selector returns a primitive (boolean). 
    // React will NOT re-render if the boolean value hasn't changed, 
    // even if 'state.nodes' has changed reference.
    const hasStartNode = useWorkflowStore((state) =>
        state.nodes.some(node => node.type === 'startNode')
    );

    const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
        event.dataTransfer.setData('application/reactflow/type', nodeType);
        event.dataTransfer.setData('application/reactflow/label', label);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside className="w-64 bg-black/40 backdrop-blur-md border-r border-white/10 p-4 flex flex-col gap-4 z-40 h-full select-none">
            <div className="text-sm font-semibold text-gray-400 mb-2">Nodes</div>

            <div
                className={`
                    flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 transition-all
                    ${hasStartNode
                        ? 'opacity-50 cursor-not-allowed grayscale'
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

            <div
                className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 cursor-grab hover:bg-white/10 hover:border-white/20 active:cursor-grabbing transition-all"
                onDragStart={(event) => onDragStart(event, 'commandNode', 'Command')}
                draggable
            >
                <div className="p-2 rounded bg-orange-500/20 text-orange-400">
                    <Sparkles size={20} />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">Command Node</span>
                    <span className="text-xs text-gray-500">Generate commands</span>
                </div>
            </div>
        </aside>
    );
});