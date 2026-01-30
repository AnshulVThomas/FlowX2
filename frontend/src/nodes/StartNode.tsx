import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Play } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { saveWorkflow } from '../services/api';
import { toast } from 'sonner';

export type StartNodeData = Node<{
    name: string;
    status: string;
}>;

export function StartNode({ data }: NodeProps<StartNodeData>) {
    const { workflows, activeId } = useWorkflowStore();

    const handleRun = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent node selection/drag start

        const activeWorkflow = workflows.find(w => w.id === activeId);
        if (!activeWorkflow) {
            toast.error('No active workflow found');
            return;
        }

        try {
            await saveWorkflow(activeWorkflow);
            toast.success('Workflow saved and run started');
        } catch (error) {
            toast.error('Failed to save workflow');
        }
    };

    return (
        <div className="flex items-center gap-3 px-4 py-3 shadow-lg rounded-xl bg-white border border-stone-200 min-w-[150px]">
            <div
                onClick={handleRun}
                className="rounded-full w-10 h-10 flex justify-center items-center bg-blue-50 border border-blue-100 shadow-sm shrink-0 cursor-pointer hover:bg-blue-100 transition-colors"
            >
                <Play size={20} className="text-blue-500 fill-blue-500/20" />
            </div>
            <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-800 leading-tight">
                    {data.name || 'Start'}
                </span>
                <span className="text-xs font-semibold text-gray-400 tracking-wide uppercase mt-0.5">
                    {data.status || 'IDLE'}
                </span>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white transition-transform hover:scale-110"
            />
        </div>
    );
}
