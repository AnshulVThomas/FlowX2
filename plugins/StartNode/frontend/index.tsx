import { memo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Play, Square } from 'lucide-react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';
import { ValidationShield } from '@core/components/ValidationShield';
import { SudoModal } from '@core/components/SudoModal';
import { toast } from 'sonner';

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
    const executeGraph = useWorkflowStore((state) => state.executeGraph);
    const abortWorkflow = useWorkflowStore((state) => state.abortWorkflow);

    // Select specific data for this node to avoid re-renders when other nodes validate
    const validationStatus = useWorkflowStore((state) => state.validationStatus[id]);
    const validationErrors = useWorkflowStore((state) => state.validationErrors?.[id]);

    const [isValidating, setIsValidating] = useState(false);

    // Sudo State
    const [showSudoModal, setShowSudoModal] = useState(false);
    const [sudoCount, setSudoCount] = useState(0);

    // --- EXECUTION LOGIC ---
    const runExecution = useCallback(async (password?: string) => {
        setIsValidating(true);
        try {
            await saveActiveWorkflow();
            await validateGraph();

            // Execute with optional password
            await executeGraph(password);

            toast.success('Execution Started');
        } catch (error) {
            console.error(error);
            toast.error('Execution failed');
            setIsValidating(false);
        } finally {
            // If execution is async (fire & forget), we stop validating immediately. 
            // If it awaits, we stop after. 'executeGraph' awaits the basic fetch response, not full run.
            setIsValidating(false);
        }
    }, [saveActiveWorkflow, validateGraph, executeGraph]);

    // --- HANDLERS ---
    const handleRunClick = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();

        // 1. If running, Abort
        if (isValidating) {
            toast.info('Requesting Cancellation...');
            await abortWorkflow();
            return;
        }

        // 2. Pre-Flight Sudo Check
        const allNodes = useWorkflowStore.getState().nodes;
        // FIX: Only check for sudoLock, not generic locked status
        const requiresSudo = allNodes.some(n => n.data?.sudoLock);

        if (requiresSudo) {
            // 3. Sweep canvas for VaultNode
            const vaultNode = allNodes.find(n => n.type === 'vaultNode');
            const savedPassword = vaultNode?.data?.sudoPassword;

            if (savedPassword && String(savedPassword).trim() !== '') {
                // Vault found and populated — run silently, bypass modal
                await runExecution(String(savedPassword));
            } else {
                // No Vault or empty — fallback to manual modal
                // FIX: Only count nodes that explicitly need sudo
                const sudoNodes = allNodes.filter(n => n.data?.sudoLock);
                setSudoCount(sudoNodes.length);
                setShowSudoModal(true);
            }
            return;
        }

        // 4. Normal Execution (no sudo needed)
        await runExecution();

    }, [isValidating, abortWorkflow, runExecution]);

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
                        ${isValidating
                            ? 'bg-red-50 border-red-100 hover:bg-red-500' // Red for cancel
                            : 'bg-blue-50 border-blue-100 hover:bg-blue-500' // Blue for run
                        }
                    `}
                >
                    {isValidating ? (
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
                    <span className={`text-xs font-bold tracking-wide uppercase mt-0.5 ${isValidating ? 'text-amber-500' : styles.textClass}`}>
                        {isValidating ? 'STARTING...' : (data.status || 'IDLE')}
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
