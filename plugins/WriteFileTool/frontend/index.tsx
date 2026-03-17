import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { FilePlus2 } from 'lucide-react';

const ALLOWED_TARGETS = ['reactAgent', 'reactAgentV2'];

const WriteFileToolUI = ({ data, selected }: NodeProps) => {
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: any) => {
        const targetNode = getNode(connection.target);
        return !!(targetNode && ALLOWED_TARGETS.includes(targetNode.type || ''));
    }, [getNode]);

    // --- ANIMATION STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError   = data.execution_status === 'failed';

    let borderClass = selected
        ? 'border-emerald-500 shadow-lg shadow-emerald-500/20'
        : 'border-gray-200 shadow-sm';
    let iconBg    = 'bg-emerald-50';
    let iconColor = 'text-emerald-500';

    if (isRunning) {
        borderClass = 'border-transparent shadow-[0_0_40px_-10px_rgba(234,179,8,0.5)]';
        iconBg      = 'bg-yellow-100';
        iconColor   = 'text-yellow-600';
    } else if (isSuccess) {
        borderClass = 'border-emerald-500 shadow-[0_0_30px_-10px_rgba(34,197,94,0.4)]';
        iconBg      = 'bg-emerald-50';
        iconColor   = 'text-emerald-500';
    } else if (isError) {
        borderClass = 'border-rose-500 shadow-[0_0_30px_-10px_rgba(239,68,68,0.4)]';
        iconBg      = 'bg-rose-50';
        iconColor   = 'text-rose-500';
    }

    return (
        <div className="relative group w-[140px]">

            {/* POWER SURGE GLOW (Only when running) */}
            {isRunning && (
                <div className="absolute -inset-[4px] bg-yellow-400/30 rounded-xl blur-md animate-pulse z-0" />
            )}

            {/* SPINNING GRADIENT */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-xl overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg_at_50%_50%,#fef08a_0%,#eab308_50%,#ca8a04_100%)] animate-[spin_3s_linear_infinite]" />
                </div>
            )}

            <div className={`
                relative flex flex-col items-center gap-2 px-3 py-2 rounded-xl 
                bg-white border-2 transition-all duration-300 z-10
                ${borderClass}
            `}>
                <div className="flex items-center gap-2 w-full min-w-0">
                    <div className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${iconBg}`}>
                        <FilePlus2 size={14} className={`transition-colors ${iconColor}`} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[11px] font-bold text-slate-700 truncate">Write File</span>
                        <span className="text-[9px] text-slate-400 truncate">
                            {isRunning ? 'Running...' : '/workspace'}
                        </span>
                    </div>
                </div>

                {/* OUTPUT HANDLE */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    isValidConnection={isValidConnection}
                    className={`!w-3 !h-3 !border-2 !border-white transition-all shadow-sm
                        ${isRunning ? '!bg-yellow-400 animate-pulse' : '!bg-emerald-500 hover:!bg-emerald-400'}
                    `}
                />
            </div>
        </div>
    );
};
export default memo(WriteFileToolUI);
