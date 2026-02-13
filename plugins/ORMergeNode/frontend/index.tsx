import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { GitMerge } from 'lucide-react';

export type ORMergeNodeData = Node<{
    name: string;
    status: string;
}>;

const getStatusStyles = (status: string | undefined, isSelected: boolean) => {
    const s = (status || 'idle').toLowerCase();

    let borderColor = 'border-amber-200';
    let ringClass = '';
    let statusText = 'text-gray-400';
    let iconBg = 'bg-amber-50';
    let iconBorder = 'border-amber-200';
    let iconColor = 'text-amber-600';
    let shadow = 'shadow-lg shadow-stone-200/50';

    switch (s) {
        case 'running':
            borderColor = 'border-amber-400';
            ringClass = 'ring-4 ring-amber-500/20';
            statusText = 'text-amber-500';
            iconBg = 'bg-amber-100';
            shadow = 'shadow-xl shadow-amber-500/20';
            break;
        case 'completed':
            borderColor = 'border-green-500';
            statusText = 'text-green-500';
            iconColor = 'text-green-600';
            iconBg = 'bg-green-50';
            iconBorder = 'border-green-200';
            shadow = 'shadow-lg shadow-green-500/15';
            break;
        case 'failed':
            borderColor = 'border-red-500';
            statusText = 'text-red-500';
            iconColor = 'text-red-600';
            iconBg = 'bg-red-50';
            iconBorder = 'border-red-200';
            shadow = 'shadow-lg shadow-red-500/15';
            break;
        case 'skipped':
            borderColor = 'border-gray-300';
            statusText = 'text-gray-400';
            iconColor = 'text-gray-400';
            iconBg = 'bg-gray-50';
            iconBorder = 'border-gray-200';
            shadow = 'shadow-md';
            break;
        default:
            if (isSelected) {
                borderColor = 'border-amber-500';
                ringClass = 'ring-2 ring-amber-500/20';
            }
            break;
    }

    return { borderColor, ringClass, statusText, iconBg, iconBorder, iconColor, shadow };
};

const ORMergeNodeComponent = ({ data, selected }: NodeProps<ORMergeNodeData>) => {
    const styles = getStatusStyles(data.status, selected);

    return (
        <div
            className={`
                relative flex items-center gap-3 px-4 py-3 rounded-xl
                bg-white border transition-all duration-300 min-w-[160px]
                ${styles.borderColor}
                ${styles.ringClass}
                ${styles.shadow}
            `}
        >
            {/* Icon */}
            <div className={`
                rounded-full w-10 h-10 flex items-center justify-center
                ${styles.iconBg} border ${styles.iconBorder}
                transition-colors duration-300
            `}>
                <GitMerge size={18} className={`${styles.iconColor} transition-colors duration-300`} />
            </div>

            {/* Label */}
            <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-800 leading-tight">
                    {data.name || 'OR Merge'}
                </span>
                <span className={`text-xs font-bold tracking-wide uppercase mt-0.5 ${styles.statusText}`}>
                    {data.status || 'IDLE'}
                </span>
            </div>

            {/* Handles */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white transition-transform hover:scale-125"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white transition-transform hover:scale-125"
            />
        </div>
    );
};

function propsAreEqual(prev: NodeProps<ORMergeNodeData>, next: NodeProps<ORMergeNodeData>) {
    return (
        prev.selected === next.selected &&
        prev.id === next.id &&
        prev.data.name === next.data.name &&
        prev.data.status === next.data.status
    );
}

export const ORMergeNodeUI = memo(ORMergeNodeComponent, propsAreEqual);
export default ORMergeNodeUI;
