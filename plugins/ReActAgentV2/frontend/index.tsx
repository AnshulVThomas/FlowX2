import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { Bot, Cpu, Sparkles, RotateCcw, ScrollText, Maximize, Minimize } from 'lucide-react';

const ReActAgentUIV2 = ({ id, data, selected }: NodeProps) => {
    const { setNodes } = useReactFlow();

    // Local state
    const [localPrompt, setLocalPrompt] = useState(data.prompt as string || '');
    const [showLogs, setShowLogs] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Sync external prompt changes
    useEffect(() => {
        setLocalPrompt(data.prompt as string || '');
    }, [data.prompt]);

    // Logs come from the Zustand store via data.logs (set by WS node_log handler)
    // Apply sliding window cap to prevent memory bloat
    const logs: string[] = ((data.logs as string[]) || []).slice(-100);

    // Auto-scroll logs when new entries arrive
    useEffect(() => {
        if (showLogs) {
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs.length, showLogs]);

    // Auto-switch to logs when running
    useEffect(() => {
        if (data.execution_status === 'running') {
            setShowLogs(true);
        }
    }, [data.execution_status]);

    const handleBlur = useCallback(() => {
        setNodes((nodes) => nodes.map((node) => {
            if (node.id === id) {
                return { ...node, data: { ...node.data, prompt: localPrompt } };
            }
            return node;
        }));
    }, [id, localPrompt, setNodes]);

    // --- STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError = data.execution_status === 'failed';
    const isRestarting = data.execution_status === 'restarting';
    const isStopped = data.execution_status === 'stopped';

    // --- STYLES ---
    let borderClass = 'border-gray-200';
    let shadowClass = selected ? 'shadow-xl shadow-blue-500/20' : 'shadow-lg shadow-black/5';

    if (isRunning) {
        borderClass = 'border-transparent';
        shadowClass = 'shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)]';
    } else if (isRestarting) {
        borderClass = 'border-amber-500';
        shadowClass = 'shadow-[0_0_30px_-10px_rgba(245,158,11,0.5)]';
    } else if (isStopped) {
        borderClass = 'border-red-500';
        shadowClass = 'shadow-[0_0_30px_-10px_rgba(239,68,68,0.4)]';
    } else if (selected) {
        borderClass = 'border-blue-500';
    } else if (isSuccess) {
        borderClass = 'border-emerald-500';
    } else if (isError) {
        borderClass = 'border-rose-500';
    }

    // Status info
    const getStatusInfo = () => {
        if (isRestarting) return { text: '🔄 RESTARTING...', color: 'text-amber-600', border: 'border-amber-200', dot: 'bg-amber-500 animate-pulse' };
        if (isStopped) return { text: '🛑 STOPPED', color: 'text-red-600', border: 'border-red-200', dot: 'bg-red-500' };
        if (isRunning) return { text: 'Running logic cycles...', color: 'text-purple-600', border: 'border-purple-200', dot: 'bg-purple-500 animate-pulse' };
        if (isSuccess) return { text: 'Task Completed', color: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500' };
        if (isError) return { text: 'Execution Failed', color: 'text-rose-600', border: 'border-rose-200', dot: 'bg-rose-500' };
        return { text: 'System Ready', color: 'text-gray-500', border: 'border-gray-200', dot: 'bg-gray-400' };
    };
    const statusInfo = getStatusInfo();

    // Badge info
    const getBadgeInfo = () => {
        if (isRestarting) return { text: 'RESTARTING', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' };
        if (isStopped) return { text: 'STOPPED', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' };
        if (isRunning) return { text: 'THINKING...', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' };
        return { text: 'GEMINI', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' };
    };
    const badgeInfo = getBadgeInfo();

    const widthClass = isExpanded ? 'w-[560px] min-w-[560px] max-w-[560px]' : 'w-[340px] min-w-[340px] max-w-[340px]';

    return (
        <div className={`relative group ${widthClass} transition-all duration-300`}>
            {/* Glow layers */}
            {isRunning && <div className="absolute -inset-[4px] rounded-2xl bg-purple-500/30 blur-lg animate-pulse z-0" />}
            {isRestarting && <div className="absolute -inset-[4px] rounded-2xl bg-amber-500/30 blur-lg animate-pulse z-0" />}

            {/* Spinning border gradient */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-2xl overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg_at_50%_50%,#fdf4ff_0%,#a855f7_50%,#d946ef_100%)] animate-[spin_3s_linear_infinite]" />
                </div>
            )}

            {/* MAIN CARD */}
            <div className={`
                relative flex flex-col w-full rounded-2xl overflow-hidden z-10 transition-all duration-300
                ${showLogs ? 'bg-gray-900' : 'bg-white'} border-2 ${borderClass} ${shadowClass}
            `}>
                {/* Header (always visible) */}
                <div className={`flex items-center gap-4 p-4 border-b ${showLogs ? 'border-gray-700/50 bg-gray-900' : 'border-gray-100 bg-white'}`}>
                    <div className={`
                        flex items-center justify-center w-10 h-10 rounded-xl border shadow-sm transition-colors duration-300
                        ${isRunning ? 'bg-purple-50 border-purple-200' : showLogs ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}
                    `}>
                        <Bot size={20} className={isRunning ? 'text-purple-500 animate-pulse' : showLogs ? 'text-gray-400' : 'text-gray-500'} />
                    </div>

                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className={`text-[13px] font-bold tracking-wide truncate ${showLogs ? 'text-gray-200' : 'text-gray-900'}`}>
                            ReAct Agent V2
                        </span>
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full w-fit border transition-colors duration-300 ${badgeInfo.bg} ${badgeInfo.border}`}>
                            <Sparkles size={8} className={badgeInfo.color} />
                            <span className={`text-[9px] font-bold uppercase tracking-wider truncate ${badgeInfo.color}`}>
                                {badgeInfo.text}
                            </span>
                        </div>
                    </div>

                    {/* Toggle Buttons */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800`}
                            title={isExpanded ? 'Shrink' : 'Expand'}
                        >
                            {isExpanded
                                ? <Minimize size={14} className="text-gray-400" />
                                : <Maximize size={14} className="text-gray-400" />
                            }
                        </button>
                        <button
                            onClick={() => setShowLogs(!showLogs)}
                            className={`p-1.5 rounded-lg transition-colors ${showLogs ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                            title={showLogs ? 'Show Prompt' : 'Show Logs'}
                        >
                            {showLogs
                                ? <RotateCcw size={14} className="text-gray-400" />
                                : <ScrollText size={14} className="text-gray-400" />
                            }
                        </button>
                    </div>
                </div>

                {/* === CONDITIONAL CONTENT === */}
                {!showLogs ? (
                    /* PROMPT VIEW */
                    <>
                        <div className="p-4 flex flex-col gap-2 bg-slate-50/50">
                            <div className="flex items-center gap-1.5 px-1">
                                <Cpu size={10} className="text-gray-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    Mission Directive
                                </span>
                            </div>
                            <textarea
                                className="w-full bg-white text-gray-800 text-xs p-3 rounded-xl border border-gray-200
                                focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none
                                resize-none h-[100px] font-mono placeholder:text-gray-400 shadow-sm"
                                placeholder="// Enter instruction..."
                                value={localPrompt}
                                onChange={(e) => setLocalPrompt(e.target.value)}
                                onBlur={handleBlur}
                                spellCheck={false}
                            />
                        </div>

                        {/* Status Footer */}
                        <div className="px-4 pb-4 pt-2 bg-slate-50/50 rounded-b-2xl">
                            <div className={`flex items-center justify-between px-3 py-2 rounded-lg border bg-white transition-colors duration-300 ${statusInfo.border}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusInfo.dot}`} />
                                    <span className={`text-[10px] font-medium truncate ${statusInfo.color}`}>
                                        {statusInfo.text}
                                    </span>
                                </div>
                                <code className="text-[9px] text-gray-400 font-mono flex-shrink-0">Gemini</code>
                            </div>
                        </div>
                    </>
                ) : (
                    /* LOG VIEW */
                    <>
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/30">
                            <div className="flex items-center gap-2">
                                <ScrollText size={12} className="text-purple-400" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Agent Logs</span>
                            </div>
                            {isRunning && <span className="text-[9px] text-purple-400 animate-pulse font-bold">● LIVE</span>}
                        </div>
                        <div 
                            className="overflow-y-auto p-3 max-h-[300px] min-h-[160px] nowheel nodrag scrollbar-thin scrollbar-thumb-gray-700 pb-4"
                            style={{ overflowX: 'auto', overflowY: 'auto', width: '100%', maxWidth: isExpanded ? '556px' : '336px', boxSizing: 'border-box' }}
                            onWheelCapture={(e) => e.stopPropagation()} 
                        >
                            {logs.length === 0 ? (
                                <div className="flex items-center justify-center h-[140px]">
                                    <span className="text-[11px] text-gray-600 italic">No logs yet. Run workflow to see agent thoughts.</span>
                                </div>
                            ) : (
                                <div className="flex flex-col space-y-1" style={{ width: 'max-content', minWidth: '100%' }}>
                                    {logs.map((log, i) => (
                                        <pre 
                                            key={i} 
                                            className="text-[10px] text-gray-300 font-mono leading-relaxed block"
                                            style={{ whiteSpace: 'pre', margin: 0, paddingRight: '1rem' }}
                                        >
                                            {log}
                                        </pre>
                                    ))}
                                    <div ref={logEndRef} />
                                </div>
                            )}
                        </div>

                        {/* Status Footer (dark themed) */}
                        <div className="px-4 pb-3 pt-1">
                            <div className={`flex items-center justify-between px-3 py-2 rounded-lg border border-gray-700/50 bg-gray-800/50 transition-colors duration-300`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusInfo.dot}`} />
                                    <span className={`text-[10px] font-medium truncate ${statusInfo.color}`}>
                                        {statusInfo.text}
                                    </span>
                                </div>
                                <code className="text-[9px] text-gray-500 font-mono flex-shrink-0">Gemini</code>
                            </div>
                        </div>
                    </>
                )}

                {/* Handles */}
                <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white transition-all hover:scale-125 !bg-gray-500 shadow-md" />
                <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white transition-all hover:scale-125 !bg-blue-500 shadow-md" />
            </div>
        </div>
    );
};

export default memo(ReActAgentUIV2);
