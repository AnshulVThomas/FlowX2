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
    const saveActiveWorkflow = useWorkflowStore((state) => state.saveActiveWorkflow);

    const handleRun = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Stop the click from selecting the node

        try {
            await saveActiveWorkflow();
            toast.success('Workflow saved and run started');
        } catch (error) {
            toast.error('Failed to save workflow');
        }
    };

    // Helper to determine styles based on status
    const getStatusStyles = (status: string | undefined, isSelected: boolean) => {
        const s = (status || 'idle').toLowerCase();

        // Base styles
        let borderClass = 'border-stone-200';
        let ringClass = '';
        let textClass = 'text-gray-400';
        let bgClass = 'bg-white';

        switch (s) {
            case 'running':
                borderClass = 'border-blue-400';
                ringClass = 'ring-4 ring-blue-500/20'; // Prominent ring for running
                textClass = 'text-blue-500';
                break;
            case 'completed':
                borderClass = 'border-green-500';
                textClass = 'text-green-500';
                break;
            case 'failed':
                borderClass = 'border-red-500';
                textClass = 'text-red-500';
                break;
            default: // idle
                if (isSelected) {
                    borderClass = 'border-blue-500';
                    ringClass = 'ring-2 ring-blue-500/20';
                }
                break;
        }

        // Selection override for non-running/completed states if needed, 
        // or just add a selection ring if one isn't already there.
        if (isSelected && s !== 'idle') {
            // Add a subtle extra indicator or keep the status ring? 
            // Usually, status takes precedence for border color, but selection needs to be seen.
            // Let's rely on the status border but add a standard selection shadow or ring if not already ringing.
            if (s === 'completed' || s === 'failed') {
                ringClass = 'ring-2 ring-offset-1 ' + (s === 'completed' ? 'ring-green-500/40' : 'ring-red-500/40');
            }
        }

        return { borderClass, ringClass, textClass, bgClass };
    };

    const styles = getStatusStyles(data.status, selected);

    return (
        <div className={`
            flex items-center gap-3 px-4 py-3 shadow-lg rounded-xl 
            border transition-all duration-300 min-w-[150px]
            ${styles.bgClass}
            ${styles.borderClass}
            ${styles.ringClass}
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
                <span className={`text-xs font-bold tracking-wide uppercase mt-0.5 ${styles.textClass}`}>
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