import { ShieldCheck, ShieldX } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
// shadcn/ui tooltip components assumed, or using native title for now as per instructions

interface ValidationShieldProps {
    nodeId: string;
    className?: string;
}

export const ValidationShield = ({ nodeId, className = "" }: ValidationShieldProps) => {
    const status = useWorkflowStore(state => state.validationStatus[nodeId]);
    const errors = useWorkflowStore(state => state.validationErrors?.[nodeId]);
    const displayErrors = errors || [];

    if (!status) return null;

    const tooltipText = displayErrors.length > 0 ? displayErrors.join('\n') : "Validation Failed";

    return (
        <div className={`transition-all duration-300 ${className}`}>
            {status === 'READY' ? (
                <div
                    className="bg-emerald-100 text-emerald-600 p-1.5 rounded-full border border-emerald-200 shadow-sm"
                    title="Validation: READY"
                >
                    <ShieldCheck size={16} />
                </div>
            ) : status === 'VALIDATION_FAILED' ? (
                <div
                    className="bg-rose-100 text-rose-600 p-1.5 rounded-full border border-rose-200 shadow-sm animate-bounce cursor-help"
                    title={tooltipText}
                >
                    <ShieldX size={16} />
                </div>
            ) : null}
        </div>
    );
};
