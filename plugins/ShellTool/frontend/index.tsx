import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, type Connection } from '@xyflow/react';
import { Terminal } from 'lucide-react';

const ALLOWED_TARGETS = ['reactAgent'];

const ShellToolUI = ({ data, selected }: NodeProps) => {
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: any) => {
        const targetNode = getNode(connection.target);
        return !!(targetNode && ALLOWED_TARGETS.includes(targetNode.type || ''));
    }, [getNode]);

    // --- ANIMATION STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError = data.execution_status === 'failed';

    let borderClass = selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-200 shadow-sm';
    let iconBg = 'bg-blue-50';
    let iconColor = 'text-blue-500';

    if (isRunning) {
        borderClass = 'border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)]';
        iconBg = 'bg-blue-100';
    } else if (isSuccess) {
        borderClass = 'border-emerald-500 shadow-sm';
        iconBg = 'bg-emerald-50';
        iconColor = 'text-emerald-500';
    } else if (isError) {
        borderClass = 'border-rose-500 shadow-sm';
        iconBg = 'bg-rose-50';
        iconColor = 'text-rose-500';
    }

    return (
        <div className="relative group">

            {/* POWER SURGE: Electric Pulse (Only when running) */}
            {isRunning && (
                <div className="absolute -inset-1 bg-blue-400/30 rounded-lg blur-sm animate-pulse transition-all duration-300" />
            )}

            <div className={`
                relative flex flex-col items-center gap-2 px-3 py-2 rounded-lg 
                bg-white border-2 transition-all duration-300 z-10
                ${borderClass}
            `}>
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md transition-colors ${iconBg}`}>
                        <Terminal size={16} className={`transition-colors ${iconColor}`} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Shell Tool</span>
                        <span className="text-[10px] text-slate-400">
                            {isRunning ? 'Executing...' : 'Capability'}
                        </span>
                    </div>
                </div>

                {/* OUTPUT HANDLE - RESTRICTED */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    isValidConnection={isValidConnection}
                    className={`!w-3 !h-3 !border-2 !border-white transition-all shadow-sm
                        ${isRunning ? '!bg-blue-400 animate-pulse' : '!bg-blue-500 hover:!bg-blue-400'}
                    `}
                />
            </div>
        </div>
    );
};
export default memo(ShellToolUI);
