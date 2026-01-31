import { memo, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Sparkles, Terminal, Play, Settings, Save, X, RefreshCw } from 'lucide-react';
import { generateCommand, fetchSystemInfo } from '../services/api';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { toast } from 'sonner';

export type CommandNodeData = Node<{
    command?: string;
    prompt?: string;
    system_context?: any;
    ui_render?: {
        title: string;
        code_block: string;
        language: string;
        badge_color: string;
    };
}>;

const CommandNodeComponent = ({ id, data, selected }: NodeProps<CommandNodeData>) => {
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const [prompt, setPrompt] = useState(data.prompt || '');
    const [command, setCommand] = useState(data.command || '');
    const [isLoading, setIsLoading] = useState(false);
    const [uiRender, setUiRender] = useState(data.ui_render);

    // System Context State
    const [showSettings, setShowSettings] = useState(false);
    const [localSystemContext, setLocalSystemContext] = useState(data.system_context || {});
    const [jsonError, setJsonError] = useState('');
    const [contextString, setContextString] = useState(JSON.stringify(data.system_context || {}, null, 2));

    const handleGenerate = async () => {
        if (!prompt) return;

        setIsLoading(true);
        try {
            const response = await generateCommand(prompt, id, localSystemContext);

            // Update local state with API response
            setUiRender(response.ui_render);
            setCommand(response.ui_render.code_block);

            // Sync with Global Store (and Database)
            updateNodeData(id, {
                prompt: prompt, // Ensure prompt is also saved
                command: response.ui_render.code_block,
                ui_render: response.ui_render
            });

            toast.success('Command generated successfully');
        } catch (error) {
            console.error(error);
            toast.error('Failed to generate command');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveContext = () => {
        try {
            const parsed = JSON.parse(contextString);
            setLocalSystemContext(parsed);
            setJsonError('');
            setLocalSystemContext(parsed);
            setJsonError('');
            setShowSettings(false);
            updateNodeData(id, { system_context: parsed });
            toast.success('System context updated');
        } catch (e) {
            setJsonError('Invalid JSON format');
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
            flex flex-col p-0 shadow-xl rounded-xl overflow-hidden
            border bg-white transition-all duration-300 min-w-[400px]
            ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-stone-200'}
        `}>
            {/* Header / Prompt Section */}
            <div className="bg-gray-50 border-b border-gray-100 p-3 relative">
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

                    {/* Settings Button */}
                    <button
                        onClick={() => {
                            console.log("Settings clicked. Current context:", localSystemContext);
                            setShowSettings(!showSettings);
                        }}
                        className={`ml-auto p-1 rounded-md transition-colors ${showSettings ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Settings size={14} />
                    </button>
                </div>

                {showSettings ? (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] font-bold uppercase text-gray-400">System Context Override</label>
                            {jsonError && <span className="text-[10px] text-red-500">{jsonError}</span>}
                        </div>
                        <textarea
                            value={contextString}
                            onChange={(e) => setContextString(e.target.value)}
                            className={`w-full h-32 text-xs font-mono p-2 border rounded-md focus:outline-none focus:ring-1 text-gray-800 bg-white ${jsonError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 focus:border-indigo-500'}`}
                        />
                        <div className="flex justify-between mt-2">
                            <button
                                onClick={async () => {
                                    try {
                                        const info = await fetchSystemInfo();
                                        setLocalSystemContext(info);
                                        setContextString(JSON.stringify(info, null, 2));
                                        updateNodeData(id, { system_context: info });
                                        toast.success('System info refreshed');
                                    } catch (e) {
                                        toast.error('Failed to refresh system info');
                                    }
                                }}
                                className="px-2 py-1 text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 border border-orange-200 rounded hover:bg-orange-50"
                            >
                                <RefreshCw size={12} /> Reset to Live
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveContext}
                                    className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 flex items-center gap-1"
                                >
                                    <Save size={12} /> Save
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onBlur={() => updateNodeData(id, { prompt })}
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

                        {/* Run Button */}
                        <button
                            onClick={() => toast.info('Execution coming in Tier 4!')}
                            className="px-2 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 shadow-sm transition-all flex items-center justify-center"
                            title="Run Command"
                        >
                            <Play size={12} className="ml-0.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Command Output Section */}
            {!showSettings && (
                <div className="bg-gray-900 text-gray-200 font-mono text-xs flex flex-col relative group">
                    {/* Window Controls Decoration */}
                    <div className="absolute top-0 left-0 right-0 h-6 bg-gray-800/50 flex items-center px-2 border-b border-white/5 pointer-events-none z-10">
                        <div className="flex gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                        </div>
                    </div>

                    <textarea
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onBlur={() => updateNodeData(id, { command })}
                        placeholder="# Waiting for input..."
                        className="w-full bg-transparent border-none text-gray-300 p-3 pt-8 focus:ring-0 resize-y min-h-[80px] max-h-[300px] leading-relaxed selection:bg-indigo-500/30 outline-none"
                        spellCheck={false}
                    />
                </div>
            )}

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
