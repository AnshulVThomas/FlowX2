import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, type Connection } from '@xyflow/react';
import { OctagonX } from 'lucide-react';

const ALLOWED_TARGETS = ['reactAgent'];

const StopToolUI = ({ data, selected }: NodeProps) => {
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: any) => {
        const targetNode = getNode(connection.target);
        return !!(targetNode && ALLOWED_TARGETS.includes(targetNode.type || ''));
    }, [getNode]);

    // --- ANIMATION STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError = data.execution_status === 'failed';

    let borderClass = selected ? 'border-red-500 shadow-lg shadow-red-500/20' : 'border-gray-200 shadow-sm';
    let iconBg = 'bg-red-50';
    let iconColor = 'text-red-500';

    if (isRunning) {
        borderClass = 'border-red-400 shadow-[0_0_15px_rgba(248,113,113,0.5)]';
        iconBg = 'bg-red-100';
    } else if (isSuccess) {
        // Stop Tool "Success" means it successfully emitted the Stop signal
        borderClass = 'border-red-600 shadow-sm';
        iconBg = 'bg-red-100';
        iconColor = 'text-red-600';
    } else if (isError) {
        borderClass = 'border-orange-500 shadow-sm';
        iconBg = 'bg-orange-50';
        iconColor = 'text-orange-500';
    }

    return (
        <div className="relative group">

            {/* POWER SURGE: Red Pulse for Stop */}
            {isRunning && (
                <div className="absolute -inset-1 bg-red-500/30 rounded-lg blur-sm animate-pulse transition-all duration-300" />
            )}

            <div className={`
                relative flex flex-col items-center gap-2 px-3 py-2 rounded-lg 
                bg-white border-2 transition-all duration-300 z-10
                ${borderClass}
            `}>
                {/* Icon & Label Group */}
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md transition-colors ${iconBg}`}>
                        <OctagonX size={16} className={`transition-colors ${iconColor}`} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Stop Tool</span>
                        <span className="text-[10px] text-slate-400">
                            {isRunning ? 'Stopping...' : 'Control'}
                        </span>
                    </div>
                </div>

                <Handle
                    type="source"
                    position={Position.Bottom}
                    className={`!w-3 !h-3 !border-2 !border-white transition-all shadow-sm
                        ${isRunning ? '!bg-red-400 animate-pulse' : '!bg-red-500 hover:!bg-red-400'}
                    `}
                    isValidConnection={isValidConnection}
                />
            </div>
        </div>
    );

};
export default memo(StopToolUI);
