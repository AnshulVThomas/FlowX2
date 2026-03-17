import { memo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Play, Square } from 'lucide-react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';
import { ValidationShield } from '@core/components/ValidationShield';
import { SudoModal } from '@core/components/SudoModal';
import { toast } from 'sonner';
import { SudoRequiredError } from '@core/store/useWorkflowStore';

export type StartNodeData = Node<{
    name: string;
    status: string;
}>;

// --- OPTIMIZATION 1: Extract pure logic outside component ---
const getStatusStyles = (status: string | undefined, isSelected: boolean) => {
    const s = (status || 'idle').toLowerCase();

    // Base styles
    let borderClass = 'border-stone-200';
    let ringClass = '';
    let textClass = 'text-gray-400';
    let bgClass = 'bg-white';
    let shadowClass = 'shadow-lg shadow-stone-200/50';

    if (isSelected) {
        borderClass = 'border-blue-500';
        ringClass = 'ring-2 ring-blue-500';
        shadowClass = 'shadow-xl shadow-blue-500/30';
    }

    switch (s) {
        case 'running':
            borderClass = 'border-blue-400';
            // Selection overrides running ring if needed, or we combine?
            // CommandNode: if selected, uses Blue Ring. If running, uses Purple.
            // Priority: Selected > Running? Or Running > Selected? 
            // CommandNode code: if (selected) { ... } else if (running) { ... }
            // So Selection takes priority for Ring/Shadow.

            if (!isSelected) {
                ringClass = 'ring-1 ring-blue-500/20'; // Running glow if not selected
                // Actually StartNode used 'ring-4 ring-blue-500/20' for running.
                ringClass = 'ring-4 ring-blue-500/20';
            }
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
            break;
    }

    // CommandNode logic: Selected WINS.
    if (isSelected) {
        ringClass = "ring-2 ring-blue-500";
        shadowClass = "shadow-xl shadow-blue-500/30";
    }

    return { borderClass, ringClass, textClass, bgClass, shadowClass };
};

const StartNodeComponent = ({ id, data, selected }: NodeProps<StartNodeData>) => {
    // Selectors
    const saveActiveWorkflow = useWorkflowStore((state) => state.saveActiveWorkflow);
    const validateGraph = useWorkflowStore((state) => state.validateGraph);
    const executeGraph = useWorkflowStore((state) => state.executeGraph);
    const abortWorkflow = useWorkflowStore((state) => state.abortWorkflow);

    // Select specific data for this node to avoid re-renders when other nodes validate
    const validationStatus = useWorkflowStore((state) => state.validationStatus[id]);
    const validationErrors = useWorkflowStore((state) => state.validationErrors?.[id]);

    // Check if the entire workflow is running by looking at any node's status
    const isWorkflowRunning = useWorkflowStore((state) => 
        state.nodes.some(n => {
            const s = n.data?.execution_status || n.data?.status;
            return s === 'starting' || s === 'running' || s === 'attention_required' || s === 'pending';
        })
    );

    // Derived from global websocket status, removes local state desync risk
    const isStarting = data.status === 'starting' || data.status === 'running' || data.status === 'attention_required';

    // Sudo State
    const [showSudoModal, setShowSudoModal] = useState(false);
    const [sudoCount, setSudoCount] = useState(0);

    // --- EXECUTION LOGIC ---
    const runExecution = useCallback(async (password?: string) => {
        try {
            await saveActiveWorkflow();
            await validateGraph();
            await executeGraph(password); // Engine state takes over via WS
        } catch (error: any) {
            if (error instanceof SudoRequiredError) {
                setSudoCount(error.count);
                setShowSudoModal(true);
            } else {
                console.error(error);
                toast.error('Execution failed');
            }
        }
    }, [saveActiveWorkflow, validateGraph, executeGraph]);

    // --- HANDLERS ---
    const handleRunClick = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (isWorkflowRunning) {
            toast.info('Requesting Cancellation...');
            await abortWorkflow();
            return;
        }

        await runExecution();
    }, [isWorkflowRunning, abortWorkflow, runExecution]);

    const handleSudoConfirm = useCallback(async (password: string) => {
        setShowSudoModal(false); // Fix: Close modal immediately
        // Proceed with execution using injected password
        await runExecution(password);
    }, [runExecution]);

    // Recalculate styles only when relevant props change
    const styles = getStatusStyles(data.status, selected);

    return (
        <>
            <div className={`
                relative flex items-center gap-3 px-4 py-3 shadow-lg rounded-xl 
                border transition-all duration-300 min-w-[150px]
                ${styles.bgClass}
                ${styles.borderClass}
                ${styles.ringClass}
                ${styles.shadowClass}
            `}>
                <ValidationShield
                    status={validationStatus}
                    errors={validationErrors}
                    className="absolute -top-2 -right-2 z-10 scale-0 animate-in zoom-in duration-300 fill-mode-forwards"
                />

                <div
                    onClick={handleRunClick}
                    className={`
                        group rounded-full w-10 h-10 flex justify-center items-center 
                        border shadow-sm shrink-0 cursor-pointer transition-all duration-300
                        ${isWorkflowRunning
                            ? 'bg-red-50 border-red-100 hover:bg-red-500' // Red for cancel
                            : 'bg-blue-50 border-blue-100 hover:bg-blue-500' // Blue for run
                        }
                    `}
                >
                    {isWorkflowRunning ? (
                        <Square
                            size={16}
                            className="text-red-500 fill-red-500/20 group-hover:text-white group-hover:fill-white"
                        />
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
                    <span className={`text-xs font-bold tracking-wide uppercase mt-0.5 ${isStarting ? 'text-amber-500' : styles.textClass}`}>
                        {isStarting ? 'RUNNING...' : (data.status === 'completed' ? 'COMPLETED ✓' : data.status === 'failed' ? 'FAILED ✗' : (data.status || 'IDLE'))}
                    </span>
                </div>

                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white transition-transform hover:scale-110"
                />
            </div>

            {/* Portal Sudo Modal to Document Body to escape React Flow scaling/overflow */}
            {showSudoModal && createPortal(
                <SudoModal
                    isOpen={showSudoModal}
                    onClose={() => setShowSudoModal(false)}
                    onConfirm={handleSudoConfirm}
                    sudoCount={sudoCount}
                />,
                document.body
            )}
        </>
    );
};

export const StartNode = memo(StartNodeComponent);
export default StartNode;
