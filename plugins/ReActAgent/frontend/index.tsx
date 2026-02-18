import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { Bot, Cpu, Sparkles } from 'lucide-react';

const ReActAgentUI = ({ id, data, selected }: NodeProps) => {
    const { setNodes } = useReactFlow();

    const handleChange = useCallback((evt: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = evt.target.value;
        setNodes((nodes) => nodes.map((node) => {
            if (node.id === id) {
                return { ...node, data: { ...node.data, prompt: val } };
            }
            return node;
        }));
    }, [id, setNodes]);

    // --- STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError = data.execution_status === 'failed';

    // --- STYLES ---
    // We use border-2 consistently to prevent layout jumps.
    // When running, we make the border transparent to show the gradient behind it.
    let borderClass = 'border-gray-200';
    let shadowClass = selected ? 'shadow-xl shadow-blue-500/20' : 'shadow-lg shadow-black/5';

    if (isRunning) {
        borderClass = 'border-transparent'; // Hide border so gradient shows
        shadowClass = 'shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)]';
    } else if (selected) {
        borderClass = 'border-blue-500';
    } else if (isSuccess) {
        borderClass = 'border-emerald-500';
    } else if (isError) {
        borderClass = 'border-rose-500';
    }

    return (
        // OUTER WRAPPER: Fixed width prevents horizontal jumping
        <div className="relative group w-[340px]">

            {/* 1. GLOW LAYER (Only when running) */}
            {isRunning && (
                <div className="absolute -inset-[4px] rounded-2xl bg-purple-500/30 blur-lg animate-pulse z-0" />
            )}

            {/* 2. SPINNING BORDER GRADIENT (Match Command Node thickness) */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-2xl overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg_at_50%_50%,#fdf4ff_0%,#a855f7_50%,#d946ef_100%)] animate-[spin_3s_linear_infinite]" />
                </div>
            )}

            {/* 3. MAIN CONTENT CARD (Sits on top) */}
            <div className={`
                relative flex flex-col w-full rounded-2xl overflow-hidden z-10 transition-all duration-300
                bg-white border-2 ${borderClass} ${shadowClass}
            `}>
                {/* Header */}
                <div className="flex items-center gap-4 p-4 border-b border-gray-100 bg-white">
                    <div className={`
                        flex items-center justify-center w-10 h-10 rounded-xl border shadow-sm transition-colors duration-300
                        ${isRunning ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-100'}
                    `}>
                        <Bot size={20} className={isRunning ? 'text-purple-500 animate-pulse' : 'text-gray-500'} />
                    </div>

                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-[13px] font-bold text-gray-900 tracking-wide truncate">
                            ReAct Agent
                        </span>

                        {/* Status Badge */}
                        <div className={`
                            flex items-center gap-1.5 px-2 py-0.5 rounded-full w-fit border transition-colors duration-300
                            ${isRunning ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'}
                        `}>
                            <Sparkles size={8} className={isRunning ? 'text-purple-500' : 'text-blue-500'} />
                            <span className={`text-[9px] font-bold uppercase tracking-wider truncate ${isRunning ? 'text-purple-600' : 'text-blue-600'}`}>
                                {isRunning ? 'THINKING...' : 'AI CORE'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Prompt Input */}
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
                        defaultValue={data.prompt as string}
                        onChange={handleChange}
                        spellCheck={false}
                    />
                </div>

                {/* Status Footer */}
                <div className="px-4 pb-4 pt-2 bg-slate-50/50 rounded-b-2xl">
                    <div className={`
                        flex items-center justify-between px-3 py-2 rounded-lg border bg-white transition-colors duration-300
                        ${isRunning ? 'border-purple-200' : isSuccess ? 'border-emerald-200' : isError ? 'border-rose-200' : 'border-gray-200'}
                    `}>
                        <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRunning ? 'bg-purple-500 animate-pulse' : isSuccess ? 'bg-emerald-500' : isError ? 'bg-rose-500' : 'bg-gray-400'}`} />

                            {/* TRUNCATE PREVENTS JUMPING */}
                            <span className={`text-[10px] font-medium truncate ${isRunning ? 'text-purple-600' : isSuccess ? 'text-emerald-600' : isError ? 'text-rose-600' : 'text-gray-500'}`}>
                                {isRunning ? 'Running logic cycles...' : isSuccess ? 'Task Completed' : isError ? 'Execution Failed' : 'System Ready'}
                            </span>
                        </div>
                        <code className="text-[9px] text-gray-400 font-mono flex-shrink-0">Llama-3.3</code>
                    </div>
                </div>

                {/* Handles */}
                <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white transition-all hover:scale-125 !bg-gray-500 shadow-md" />
                <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white transition-all hover:scale-125 !bg-blue-500 shadow-md" />
            </div>
        </div>
    );
};

export default memo(ReActAgentUI);
