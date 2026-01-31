import { useRef, memo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Sparkles, Terminal, Play, Settings, Save, RefreshCw, Square, Check, AlertTriangle, ShieldAlert, Maximize2, Minimize2 } from 'lucide-react';
import { generateCommand, fetchSystemInfo } from '../services/api';
import { useWorkflowStore } from '../store/useWorkflowStore';
import TerminalComponent, { type TerminalRef } from '../components/TerminalComponent';
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
    // --- 1. STATE MANAGEMENT ---
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    // Inputs
    const [prompt, setPrompt] = useState(data.prompt || '');
    const [command, setCommand] = useState(data.command || '');

    // UI States
    const [isLoading, setIsLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false); // New Expand State
    const [showSettings, setShowSettings] = useState(false);

    // Data & Context
    const [uiRender, setUiRender] = useState(data.ui_render);
    const [localSystemContext, setLocalSystemContext] = useState(data.system_context || {});
    const [contextString, setContextString] = useState(JSON.stringify(data.system_context || {}, null, 2));
    const [jsonError, setJsonError] = useState('');
    const [resultStatus, setResultStatus] = useState<'success' | 'error' | null>(null);

    const terminalRef = useRef<TerminalRef>(null);

    // --- 2. LOGIC HANDLERS ---

    const handleRun = () => {
        setIsRunning(true);
        setIsTerminalOpen(true);
        setIsExpanded(true); // Auto-expand when running
        // Small delay to ensure DOM is ready for Xterm
        setTimeout(() => {
            if (terminalRef.current) {
                terminalRef.current.runCommand(command);
            }
        }, 100);
    };

    const handleStop = () => {
        setIsRunning(false);
        if (terminalRef.current) {
            terminalRef.current.stop();
            toast.info('Interrupt signal sent');
        }
    };

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        try {
            // Use local system context if overridden, else fetch new? 
            // For now, use what's in the node data or local state
            const response = await generateCommand(prompt, id, localSystemContext);

            setUiRender(response.ui_render);
            setCommand(response.ui_render.code_block);

            updateNodeData(id, {
                prompt: prompt,
                command: response.ui_render.code_block,
                ui_render: response.ui_render
            });

            toast.success('Command generated');
        } catch (error) {
            console.error(error);
            toast.error('Generation failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveContext = () => {
        try {
            const parsed = JSON.parse(contextString);
            setLocalSystemContext(parsed);
            setJsonError('');
            setShowSettings(false);
            updateNodeData(id, { system_context: parsed });
            toast.success('Context saved');
        } catch (e) {
            setJsonError('Invalid JSON');
        }
    };

    // --- 3. STYLING HELPERS ---

    const getBadgeConfig = (color?: string) => {
        switch (color) {
            case 'green': return { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20', icon: Check, label: 'SAFE' };
            case 'red': return { bg: 'bg-rose-500/10', text: 'text-rose-600', border: 'border-rose-500/20', icon: ShieldAlert, label: 'CRITICAL' };
            default: return { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/20', icon: AlertTriangle, label: 'CAUTION' };
        }
    };

    const badge = getBadgeConfig(uiRender?.badge_color);
    const BadgeIcon = badge.icon;

    // Dynamic Border/Shadow Logic
    let ringClass = "ring-1 ring-stone-200";
    let shadowClass = "shadow-lg shadow-stone-200/50";

    if (resultStatus === 'success') {
        ringClass = "ring-2 ring-emerald-500";
        shadowClass = "shadow-xl shadow-emerald-500/20";
    } else if (resultStatus === 'error') {
        ringClass = "ring-2 ring-rose-500";
        shadowClass = "shadow-xl shadow-rose-500/20";
    } else if (isRunning) {
        ringClass = "ring-2 ring-indigo-500 animate-pulse";
        shadowClass = "shadow-xl shadow-indigo-500/30";
    } else if (selected) {
        ringClass = "ring-2 ring-blue-500";
        shadowClass = "shadow-xl shadow-blue-500/30";
    }

    // --- 4. RENDER ---
    return (
        <div className={`relative group transition-all duration-300 ease-in-out ${isExpanded ? 'w-[800px] h-[500px] z-50' : 'min-w-[420px] h-auto'}`}>

            {/* Animated Gradient Background (Generating State) */}
            <div className={`absolute -inset-[3px] rounded-xl overflow-hidden transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#F1F5F9_0%,#6366f1_50%,#a855f7_100%)]" />
            </div>

            {/* Main Card Container */}
            <div className={`
                relative flex flex-col bg-white rounded-xl overflow-hidden h-full
                ${ringClass} ${shadowClass}
                transition-all duration-300
            `}>

                {/* --- A. HEADER --- */}
                <div className="bg-white px-3 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
                    <div className={`
                        p-1.5 rounded-lg flex items-center justify-center transition-colors
                        ${isLoading ? 'bg-indigo-50 text-indigo-600' : 'bg-stone-50 text-stone-600'}
                    `}>
                        <Sparkles size={14} className={isLoading ? 'animate-spin-slow' : ''} />
                    </div>

                    <div className="flex-grow flex flex-col justify-center">
                        {!showSettings ? (
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onBlur={() => updateNodeData(id, { prompt })}
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                                placeholder="Describe command..."
                                className="w-full text-xs font-medium text-gray-700 placeholder:text-gray-400 bg-transparent border-none p-0 focus:ring-0"
                            />
                        ) : (
                            <span className="text-xs font-bold text-gray-800 tracking-tight">SYSTEM CONTEXT</span>
                        )}
                    </div>

                    {uiRender && !showSettings && (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${badge.bg} ${badge.border} ${badge.text}`}>
                            <BadgeIcon size={10} />
                            <span className="text-[9px] font-bold tracking-wider">{badge.label}</span>
                        </div>
                    )}

                    <div className="h-4 w-[1px] bg-gray-200 mx-1" />

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                const newState = !isTerminalOpen;
                                setIsTerminalOpen(newState);
                                setIsExpanded(newState); // Sync expansion with terminal toggle
                            }}
                            className={`p-1.5 rounded transition-all ${isTerminalOpen ? 'bg-stone-100 text-stone-800' : 'text-gray-400 hover:text-gray-600 hover:bg-stone-50'}`}
                            title={isTerminalOpen ? "Show Editor" : "Show Terminal"}
                        >
                            <Terminal size={14} />
                        </button>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-1.5 rounded transition-all ${showSettings ? 'bg-stone-100 text-stone-800' : 'text-gray-400 hover:text-gray-600 hover:bg-stone-50'}`}
                            title="Settings"
                        >
                            <Settings size={14} />
                        </button>
                    </div>
                </div>

                {/* --- B. CONTENT BODY --- */}
                <div className="relative flex-grow bg-[#1e1e1e] min-h-[160px] flex flex-col overflow-hidden">

                    {/* 1. Settings Overlay */}
                    {showSettings && (
                        <div className="absolute inset-0 bg-stone-50 z-30 p-3 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] uppercase font-bold text-gray-400">JSON Override</span>
                                {jsonError && <span className="text-[10px] text-rose-500 font-medium">{jsonError}</span>}
                            </div>
                            <textarea
                                value={contextString}
                                onChange={(e) => setContextString(e.target.value)}
                                className={`
                                    flex-grow w-full text-[11px] font-mono leading-relaxed p-3 rounded-lg border
                                    bg-white focus:outline-none focus:ring-2 transition-all resize-none
                                    ${jsonError ? 'border-rose-300 focus:ring-rose-100' : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-100'}
                                `}
                                spellCheck={false}
                            />
                            <div className="flex justify-between mt-3 flex-shrink-0">
                                <button
                                    onClick={async () => {
                                        try {
                                            const info = await fetchSystemInfo();
                                            setLocalSystemContext(info);
                                            setContextString(JSON.stringify(info, null, 2));
                                            toast.success('Refreshed system info');
                                        } catch (e) { toast.error('Fetch failed'); }
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
                                >
                                    <RefreshCw size={10} /> Reset
                                </button>
                                <div className="flex gap-2">
                                    <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-700">Cancel</button>
                                    <button onClick={handleSaveContext} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded shadow-sm hover:bg-black transition-all">
                                        <Save size={10} /> Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. Terminal View (Persistent in DOM, toggled via Visibility) */}
                    <div className={`absolute inset-0 bg-[#1e1e1e] z-20 flex flex-col transition-opacity duration-200 ${isTerminalOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
                        {/* Interactive Mac Header */}
                        <div className="h-8 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] border-b border-white/5 flex items-center px-3 gap-2 select-none flex-shrink-0">
                            <div className="flex gap-1.5 group/win-controls">
                                {/* Close Button (Red) */}
                                <button
                                    onClick={() => {
                                        setIsTerminalOpen(false);
                                        setIsExpanded(false); // Auto-minimize when closing
                                    }}
                                    className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] hover:bg-[#FF5F56]/80 flex items-center justify-center group-hover/win-controls:text-black/50 text-transparent text-[8px] font-bold transition-all"
                                    title="Close Terminal"
                                >✕</button>

                                {/* Minimize (Yellow - Disabled for now) */}
                                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />

                                {/* Expand (Green) */}
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="w-2.5 h-2.5 rounded-full bg-[#27C93F] hover:bg-[#27C93F]/80 flex items-center justify-center group-hover/win-controls:text-black/50 text-transparent text-[6px] font-bold transition-all"
                                    title={isExpanded ? "Restore Size" : "Expand"}
                                >
                                    {isExpanded ? <Minimize2 size={6} /> : <Maximize2 size={6} />}
                                </button>
                            </div>
                            <span className="ml-2 text-[10px] text-gray-500 font-mono">bash — {isExpanded ? 'Expanded' : 'Compact'}</span>
                        </div>

                        {/* Terminal Body */}
                        <div className="flex-grow relative overflow-hidden">
                            <TerminalComponent
                                ref={terminalRef}
                                hideToolbar={true}
                                onClose={() => {
                                    setIsTerminalOpen(false);
                                    setIsExpanded(false);
                                }}
                                onCommandComplete={(code) => {
                                    setIsRunning(false);
                                    if (code === 0) {
                                        setResultStatus('success');
                                        toast.success('Execution successful');
                                    } else {
                                        setResultStatus('error');
                                        toast.error(`Exit Code: ${code}`);
                                    }
                                    setTimeout(() => setResultStatus(null), 3000);
                                }}
                            />
                        </div>
                    </div>

                    {/* 3. Code Editor View */}
                    <div className={`flex flex-col flex-grow ${isTerminalOpen ? 'invisible' : 'visible'}`}>
                        <div className="relative flex-grow bg-[#1e1e1e] group overflow-hidden flex flex-col">
                            {/* Mac Window Controls (Decoration) */}
                            <div className="h-8 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] flex items-center px-3 border-b border-white/5 z-10 flex-shrink-0">
                                <div className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                                </div>
                                <div className="mx-auto text-[10px] text-gray-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                                    script.sh
                                </div>
                            </div>

                            <textarea
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                onBlur={() => updateNodeData(id, { command })}
                                placeholder="# Generated command will appear here..."
                                className="w-full h-full bg-[#1e1e1e] text-gray-300 font-mono text-[11px] leading-relaxed p-4 pt-4 border-none focus:ring-0 resize-none outline-none scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent flex-grow"
                                spellCheck={false}
                            />
                        </div>
                    </div>
                </div>

                {/* --- C. FOOTER ACTIONS --- */}
                <div className="bg-white border-t border-gray-100 p-2 flex justify-between items-center gap-2 flex-shrink-0">

                    {!isTerminalOpen && (
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className={`
                                flex-grow flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-all
                                ${isLoading
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600'
                                }
                            `}
                        >
                            {isLoading ? <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> : <Sparkles size={12} />}
                            {isLoading ? 'Dreaming...' : 'Generate'}
                        </button>
                    )}

                    {isRunning ? (
                        <button
                            onClick={handleStop}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-md text-xs font-semibold hover:bg-rose-100 hover:border-rose-200 transition-all shadow-sm animate-pulse"
                        >
                            <Square size={12} className="fill-current" /> Stop
                        </button>
                    ) : (
                        <button
                            onClick={handleRun}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 hover:shadow-indigo-500/20 shadow-sm transition-all"
                        >
                            <Play size={12} className="fill-current" /> Run
                        </button>
                    )}
                </div>

                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125 hover:!bg-indigo-500"
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125 hover:!bg-indigo-500"
                />
            </div>
        </div>
    );
};

export const CommandNode = memo(CommandNodeComponent);