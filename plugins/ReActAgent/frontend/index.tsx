import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, type Connection } from '@xyflow/react';
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

    // --- ANIMATION STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError = data.execution_status === 'failed';

    // Dynamic Border/Shadow Logic
    let ringClass = selected ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200';
    let shadowClass = selected ? 'shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)]' : 'shadow-xl shadow-black/20';

    if (isRunning) {
        ringClass = 'ring-1 ring-purple-500/50';
        shadowClass = 'shadow-[0_0_40px_-5px_rgba(168,85,247,0.4)]';
    } else if (isSuccess) {
        ringClass = 'ring-2 ring-emerald-500';
        shadowClass = 'shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]';
    } else if (isError) {
        ringClass = 'ring-2 ring-rose-500';
        shadowClass = 'shadow-[0_0_30px_-5px_rgba(244,63,94,0.5)]';
    }

    return (
        // OUTER WRAPPER: Handles the clip and shape
        <div className="relative group rounded-2xl w-[340px] transition-all duration-300">

            {/* ANIMATION LAYER: The spinning gradient (Only visible when running) */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-[20px] bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500 opacity-75 blur-[4px] animate-pulse transition-all duration-1000 group-hover:duration-200 z-0" />
            )}

            {/* Spinning Border (The clean line) */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-[20px] overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#0000_0%,#a855f7_50%,#0000_100%)]" />
                </div>
            )}

            {/* INNER CONTENT */}
            <div className={`
                relative flex flex-col w-full h-full rounded-2xl transition-all duration-300 z-10
                bg-white ${ringClass} ${shadowClass}
            `}>
                {/* Header */}
                <div className="relative flex items-center gap-4 p-4 border-b border-gray-100">
                    <div className={`relative w-10 h-10 flex items-center justify-center rounded-xl border shadow-sm transition-colors duration-300 ${isRunning ? 'bg-purple-50 border-purple-200' : selected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                        <Bot size={20} className={`min-w-5 transition-colors duration-300 ${isRunning ? 'text-purple-500 animate-pulse' : selected ? 'text-blue-500' : 'text-gray-500'}`} />
                    </div>

                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-gray-900 tracking-wide">
                                ReAct Agent
                            </span>
                            <div className={`flex items-center justify-center gap-1 w-[100px] px-1.5 py-0.5 rounded-full border ${isRunning ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100'}`}>
                                <Sparkles size={8} className={isRunning ? 'text-purple-500' : 'text-blue-500'} />
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${isRunning ? 'text-purple-600' : 'text-blue-600'} truncate`}>
                                    {isRunning ? 'THINKING...' : 'AI CORE'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Prompt Input Area */}
                <div className="relative p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-end px-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                            <Cpu size={10} />
                            Mission Directive
                        </label>
                    </div>

                    <div className="relative group/input">
                        <textarea
                            className="relative w-full bg-gray-50 text-gray-800 text-xs p-3 rounded-xl border border-gray-200
                            focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500/20 outline-none
                            resize-none h-[120px] font-mono leading-relaxed placeholder:text-gray-400 transition-all duration-300 shadow-sm"
                            placeholder="// Enter your instruction for the agent..."
                            defaultValue={data.prompt as string}
                            onChange={handleChange}
                            spellCheck={false}
                        />
                    </div>
                </div>

                {/* Status Bar */}
                <div className="relative px-4 pb-4 pt-0">
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors duration-300 ${isRunning ? 'bg-purple-50 border-purple-100' :
                        isSuccess ? 'bg-emerald-50 border-emerald-100' :
                            isError ? 'bg-rose-50 border-rose-100' :
                                'bg-gray-50 border-gray-100'
                        }`}>
                        <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-purple-500 animate-pulse' :
                                isSuccess ? 'bg-emerald-500' :
                                    isError ? 'bg-rose-500' :
                                        selected ? 'bg-blue-500' : 'bg-gray-400'
                                }`} />
                            <span className={`text-[10px] font-medium ${isRunning ? 'text-purple-600' :
                                isSuccess ? 'text-emerald-600' :
                                    isError ? 'text-rose-600' :
                                        'text-gray-500'
                                }`}>
                                {isRunning ? 'Processing workflow...' :
                                    isSuccess ? 'Mission Accomplished' :
                                        isError ? 'Mission Failed' :
                                            'Waiting for input...'}
                            </span>
                        </div>
                        <code className="text-[9px] text-gray-400 font-mono">Llama-3.3-70b</code>
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
