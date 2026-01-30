import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Play } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { toast } from 'sonner';

export type StartNodeData = Node<{
    name: string;
    status: string;
}>;

// 1. Define the component
const StartNodeComponent = ({ data, selected }: NodeProps<StartNodeData>) => {
    // 2. Select ONLY the action needed. 
    // Do not destructure the whole store, or it will re-render on every mouse move.
    const saveActiveWorkflow = useWorkflowStore((state) => state.saveActiveWorkflow);

    const handleRun = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Stop the click from selecting the node

        try {
            // 3. Use the store action that grabs the LIVE nodes/edges from the root state
            await saveActiveWorkflow();
            toast.success('Workflow saved and run started');

            // Here you would trigger the actual execution logic
            // e.g. executeWorkflow(activeId)
        } catch (error) {
            toast.error('Failed to save workflow');
        }
    };

    return (
        <div className={`
            flex items-center gap-3 px-4 py-3 shadow-lg rounded-xl bg-white 
            border transition-colors min-w-[150px]
            ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-stone-200'}
        `}>
            <div
                onClick={handleRun}
                className="group rounded-full w-10 h-10 flex justify-center items-center bg-blue-50 border border-blue-100 shadow-sm shrink-0 cursor-pointer hover:bg-blue-500 transition-all duration-300"
            >
                <Play
                    size={20}
                    className="text-blue-500 fill-blue-500/20 group-hover:text-white group-hover:fill-white ml-0.5"
                />
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
};

// 4. Wrap in memo to prevent re-renders while dragging other nodes
export const StartNode = memo(StartNodeComponent);