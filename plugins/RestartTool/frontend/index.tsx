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
        borderClass = 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]';
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
        <div className="relative group">

            {/* POWER SURGE: Amber Pulse for Restart */}
            {isRunning && (
                <div className="absolute -inset-1 bg-amber-500/30 rounded-lg blur-sm animate-pulse transition-all duration-300" />
            )}

            <div className={`
                relative flex flex-col items-center gap-2 px-3 py-2 rounded-lg 
                bg-white border-2 transition-all duration-300 z-10
                ${borderClass}
            `}>
                {/* Icon & Label Group */}
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md transition-colors ${iconBg}`}>
                        <RotateCcw size={16} className={`transition-colors ${iconColor}`} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Restart Tool</span>
                        <span className="text-[10px] text-slate-400">
                            {isRunning ? 'Rebooting...' : 'Control'}
                        </span>
                    </div>
                </div>

                <Handle
                    type="source"
                    position={Position.Bottom}
                    className={`!w-3 !h-3 !border-2 !border-white transition-all shadow-sm
                        ${isRunning ? '!bg-amber-400 animate-pulse' : '!bg-amber-500 hover:!bg-amber-400'}
                    `}
                    isValidConnection={isValidConnection}
                />
            </div>
        </div>
    );

};
export default memo(RestartToolUI);
