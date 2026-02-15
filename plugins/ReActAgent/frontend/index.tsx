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

    return (
        <div className={`
            relative flex flex-col w-[340px] rounded-2xl border transition-all duration-300 group !opacity-100
            ${selected
                ? 'bg-white border-blue-500 shadow-[0_0_30px_-5px_rgba(59,130,246,0.6)] ring-2 ring-blue-500'
                : 'bg-white border-gray-200 shadow-xl shadow-black/20 hover:border-gray-300'
            }
        `}>
            {/* Header */}
            <div className="relative flex items-center gap-4 p-4 border-b border-gray-100">
                <div className={`relative w-10 h-10 flex items-center justify-center rounded-xl border shadow-sm transition-colors duration-300 ${selected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                    <Bot size={20} className={`min-w-5 transition-colors duration-300 ${selected ? 'text-blue-500' : 'text-gray-500'}`} />
                </div>

                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-gray-900 tracking-wide">
                            ReAct Agent
                        </span>
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-100">
                            <Sparkles size={8} className="text-blue-500" />
                            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">AI Core</span>
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
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="text-[10px] font-medium text-gray-500">Waiting for input...</span>
                    </div>
                    <code className="text-[9px] text-gray-400 font-mono">Llama-3.3-70b</code>
                </div>
            </div>

            {/* Handles */}
            <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-white transition-all hover:scale-125 !bg-gray-500 shadow-md" />
            <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-white transition-all hover:scale-125 !bg-blue-500 shadow-md" />
        </div>
    );
};

export default memo(ReActAgentUI);
