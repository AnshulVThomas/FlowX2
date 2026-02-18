import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, type Connection } from '@xyflow/react';
import { RotateCcw } from 'lucide-react';

const ALLOWED_TARGETS = ['reactAgent'];

const RestartToolUI = ({ data, selected }: NodeProps) => {
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: any) => {
        const targetNode = getNode(connection.target);
        return !!(targetNode && ALLOWED_TARGETS.includes(targetNode.type || ''));
    }, [getNode]);

    // --- ANIMATION STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError = data.execution_status === 'failed';

    let borderClass = selected ? 'border-amber-500 shadow-lg shadow-amber-500/20' : 'border-gray-200 shadow-sm';
    let iconBg = 'bg-amber-50';
    let iconColor = 'text-amber-500';

    if (isRunning) {
        borderClass = 'border-transparent shadow-[0_0_15px_rgba(251,191,36,0.5)]';
        iconBg = 'bg-amber-100';
    } else if (isSuccess) {
        borderClass = 'border-amber-600 shadow-sm';
        iconBg = 'bg-amber-100';
        iconColor = 'text-amber-600';
    } else if (isError) {
        borderClass = 'border-orange-500 shadow-sm';
        iconBg = 'bg-orange-50';
        iconColor = 'text-orange-500';
    }

    return (
        <div className="relative group w-[140px]">

            {/* 1. POWER SURGE GLOW (Only when running) */}
            {isRunning && (
                <div className="absolute -inset-[4px] bg-amber-500/20 rounded-xl blur-md animate-pulse z-0" />
            )}

            {/* 2. SPINNING GRADIENT (Match Command Node thickness) */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-xl overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg_at_50%_50%,#fffbeb_0%,#f59e0b_50%,#fbbf24_100%)] animate-[spin_3s_linear_infinite]" />
                </div>
            )}

            <div className={`
                relative flex flex-col items-center gap-2 px-3 py-2 rounded-xl 
                bg-white border-2 transition-all duration-300 z-10
                ${borderClass}
            `}>
                <div className="flex items-center gap-2 w-full min-w-0">
                    <div className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${iconBg}`}>
                        <RotateCcw size={14} className={`transition-colors ${iconColor}`} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[11px] font-bold text-slate-700 truncate">Restart Tool</span>
                        <span className="text-[9px] text-slate-400 truncate">
                            {isRunning ? 'Restarting...' : 'Control'}
                        </span>
                    </div>
                </div>

                {/* OUTPUT HANDLE - RESTRICTED */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    isValidConnection={isValidConnection}
                    className={`!w-3 !h-3 !border-2 !border-white transition-all shadow-sm
                        ${isRunning ? '!bg-amber-400 animate-pulse' : '!bg-amber-500 hover:!bg-amber-400'}
                    `}
                />
            </div>
        </div>
    );

};
export default memo(RestartToolUI);
