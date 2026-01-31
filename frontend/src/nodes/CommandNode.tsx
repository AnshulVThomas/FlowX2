import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Sparkles } from 'lucide-react';

export type CommandNodeData = Node<{
    command?: string;
    prompt?: string;
}>;

const CommandNodeComponent = ({ data, selected }: NodeProps<CommandNodeData>) => {
    const [prompt, setPrompt] = useState(data.prompt || '');
    const [command, setCommand] = useState(data.command || '');

    // Placeholder for generate functionality
    const handleGenerate = () => {
        console.log('Generate command from:', prompt);
        // Will implement actual generation logic later
    };

    return (
        <div className={`
            flex flex-col gap-2 p-3 shadow-lg rounded-xl 
            border bg-white transition-all duration-300 min-w-[300px]
            ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-stone-200'}
        `}>
            {/* Header / Prompt Section */}
            <div className="flex gap-2 items-center">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                    <Sparkles size={16} />
                </div>
                <span className="text-sm font-semibold text-gray-700">Command Generator</span>
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want to do..."
                    className="flex-grow px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
                <button
                    onClick={handleGenerate}
                    className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-black transition-colors flex items-center gap-1"
                >
                    <Sparkles size={12} />
                    Gen
                </button>
            </div>

            {/* Command Output Section */}
            <div className="mt-1">
                <label className="text-[10px] uppercase font-bold text-gray-400 mb-1 block">
                    Command
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <span className="text-gray-400 font-mono text-xs">$</span>
                    </div>
                    <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="echo 'Hello World'"
                        className="w-full pl-5 pr-2 py-1.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-gray-700"
                    />
                </div>
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
