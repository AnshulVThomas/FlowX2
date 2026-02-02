import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Play, Loader2 } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { ValidationShield } from '../components/ValidationShield';
import { toast } from 'sonner';

export type StartNodeData = Node<{
    name: string;
    status: string;
}>;

// --- OPTIMIZATION 1: Extract pure logic outside component ---
// This prevents re-creation of this function on every render frame
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
            ringClass = 'ring-4 ring-blue-500/20';
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

    if (isSelected && s !== 'idle') {
        if (s === 'completed' || s === 'failed') {
            ringClass = 'ring-2 ring-offset-1 ' + (s === 'completed' ? 'ring-green-500/40' : 'ring-red-500/40');
        }
    }

    return { borderClass, ringClass, textClass, bgClass };
};

const StartNodeComponent = ({ id, data, selected }: NodeProps<StartNodeData>) => {
    // Selectors
    const saveActiveWorkflow = useWorkflowStore((state) => state.saveActiveWorkflow);
    const validateGraph = useWorkflowStore((state) => state.validateGraph);

    // Select specific data for this node to avoid re-renders when other nodes validate
    const validationStatus = useWorkflowStore((state) => state.validationStatus[id]);
    const validationErrors = useWorkflowStore((state) => state.validationErrors?.[id]);

    const [isValidating, setIsValidating] = useState(false);

    // --- OPTIMIZATION 2: Stable Handler ---
    const handleRun = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();

        setIsValidating(true);
        try {
            // Await both to ensure sequentiality
            await saveActiveWorkflow();
            await validateGraph();

            // Execute Tier 3 Backend
            // We access store directly or via hook props?
            // Since we are inside component, we can use the selector below
            // Actually, we didn't select executeGraph yet. 
            // We should use store.getState().executeGraph() or add it to selectors.
            await useWorkflowStore.getState().executeGraph();

            toast.success('Execution Started');
        } catch (error) {
            toast.error('Execution failed');
        } finally {
            // Keep animation for a moment for UX visibility
            setTimeout(() => setIsValidating(false), 800);
        }
    }, [saveActiveWorkflow, validateGraph]);

    // Recalculate styles only when relevant props change
    const styles = getStatusStyles(data.status, selected);

    return (
        <div className={`
            relative flex items-center gap-3 px-4 py-3 shadow-lg rounded-xl 
            border transition-all duration-300 min-w-[150px]
            ${styles.bgClass}
            ${styles.borderClass}
            ${styles.ringClass}
        `}>
            <ValidationShield
                status={validationStatus}
                errors={validationErrors}
                className="absolute -top-2 -right-2 z-10 scale-0 animate-in zoom-in duration-300 fill-mode-forwards"
            />

            <div
                onClick={handleRun}
                className={`
                    group rounded-full w-10 h-10 flex justify-center items-center 
                    border shadow-sm shrink-0 cursor-pointer transition-all duration-300
                    ${isValidating
                        ? 'bg-amber-100 border-amber-200 text-amber-600 animate-spin'
                        : 'bg-blue-50 border-blue-100 hover:bg-blue-500'
                    }
                `}
            >
                {isValidating ? (
                    <Loader2 size={20} />
                ) : (
                    <Play
                        size={20}
                        className="text-blue-500 fill-blue-500/20 group-hover:text-white group-hover:fill-white ml-0.5"
                    />
                )}
            </div>

            <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-800 leading-tight">
                    {data.name || 'Start'}
                </span>
                <span className={`text-xs font-bold tracking-wide uppercase mt-0.5 ${isValidating ? 'text-amber-500' : styles.textClass}`}>
                    {isValidating ? 'VERIFYING...' : (data.status || 'IDLE')}
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

// --- OPTIMIZATION 3: Custom Compare (Optional but recommended for strict performance) ---
// If you don't need deep comparison, simple memo is fine. 
// Given the props, simple memo is sufficient as React Flow handles 'data' immutability well.
export const StartNode = memo(StartNodeComponent);