import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Sparkles, Terminal, ShieldAlert } from 'lucide-react';
import { generateCommand } from '../services/api';
import { toast } from 'sonner';

export type CommandNodeData = Node<{
    command?: string;
    prompt?: string;
    ui_render?: {
        title: string;
        code_block: string;
        language: string;
        badge_color: string;
    };
}>;

const CommandNodeComponent = ({ id, data, selected }: NodeProps<CommandNodeData>) => {
    const [prompt, setPrompt] = useState(data.prompt || '');
    const [command, setCommand] = useState(data.command || '');
    const [isLoading, setIsLoading] = useState(false);
    const [uiRender, setUiRender] = useState(data.ui_render);

    const handleGenerate = async () => {
        if (!prompt) return;

        setIsLoading(true);
        try {
            const response = await generateCommand(prompt, id);

            // Update local state with API response
            setUiRender(response.ui_render);
            setCommand(response.ui_render.code_block);

            toast.success('Command generated successfully');
        } catch (error) {
            console.error(error);
            toast.error('Failed to generate command');
        } finally {
            setIsLoading(false);
        }
    };

    // Helper for badge colors
    const getBadgeStyles = (color: string) => {
        switch (color) {
            case 'green': return 'bg-green-100 text-green-700 border-green-200';
            case 'yellow': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'red': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className={`
            flex flex-col gap-2 p-0 shadow-xl rounded-xl overflow-hidden
            border bg-white transition-all duration-300 min-w-[350px]
            ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-stone-200'}
        `}>
            {/* Header / Prompt Section */}
            <div className="bg-gray-50 border-b border-gray-100 p-3">
                <div className="flex gap-2 items-center mb-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                        <Sparkles size={16} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700">AI Command Generator</span>

                    {uiRender && (
                        <div className={`ml-auto px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${getBadgeStyles(uiRender.badge_color)}`}>
                            {uiRender.badge_color === 'green' ? 'SAFE' : uiRender.badge_color === 'red' ? 'CRITICAL' : 'CAUTION'}
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Install Docker on Arch"
                        className="flex-grow px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading}
                        className={`
                            px-3 py-1.5 text-white text-xs font-medium rounded-md flex items-center gap-1 transition-all
                            ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'}
                        `}
                    >
                        {isLoading ? (
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Sparkles size={12} />
                        )}
                        {isLoading ? '...' : 'Gen'}
                    </button>
                </div>
            </div>

            {/* Command Output Section */}
            <div className="p-3 bg-gray-900 text-gray-200 min-h-[80px] flex flex-col font-mono text-xs">
                <div className="flex justify-between items-center mb-2 opacity-50">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    </div>
                    <Terminal size={12} />
                </div>

                {command ? (
                    <div className="break-all selection:bg-indigo-500/30">
                        <span className="text-green-400 mr-2">$</span>
                        {command}
                    </div>
                ) : (
                    <div className="text-gray-600 italic">
                        Waiting for input...
                    </div>
                )}
            </div>

            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white transition-transform hover:scale-110"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white transition-transform hover:scale-110"
            />
        </div>
    );
};

export const CommandNode = memo(CommandNodeComponent);
