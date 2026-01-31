import { useRef, memo, useState, useCallback, useEffect } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Sparkles, Terminal, Play, Settings, Save, RefreshCw, Square, Check, AlertTriangle, ShieldAlert, Maximize2, Minimize2, History, X, Lock, Unlock, Info } from 'lucide-react';
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
        description: string;
        system_effect: string;
    };
}>;

// --- OPTIMIZATION 1: Extract Badge Config to static helper (avoids recreation) ---
const getBadgeConfig = (color?: string) => {
    switch (color) {
        case 'green': return { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20', icon: Check, label: 'SAFE' };
        case 'red': return { bg: 'bg-rose-500/10', text: 'text-rose-600', border: 'border-rose-500/20', icon: ShieldAlert, label: 'CRITICAL' };
        default: return { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/20', icon: AlertTriangle, label: 'CAUTION' };
    }
};

const CommandNodeComponent = ({ id, data, selected }: NodeProps<CommandNodeData>) => {
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    // Local State
    const [prompt, setPrompt] = useState(data.prompt || '');
    const [command, setCommand] = useState(data.command || '');

    // History State (Local only, not persisted to DB)
    const [history, setHistory] = useState<Array<{ prompt: string, command: string, timestamp: number, type: 'generated' | 'executed', status?: 'success' | 'failure' | 'pending' }>>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    // UI States
    const [isLoading, setIsLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Safety Lock State
    const [isLocked, setIsLocked] = useState(false);

    // Context & Data
    const [uiRender, setUiRender] = useState(data.ui_render);

    // Auto-lock high risk commands
    useEffect(() => {
        if (uiRender?.badge_color === 'red' || uiRender?.badge_color === 'yellow') {
            setIsLocked(true);
        } else {
            setIsLocked(false);
        }
    }, [uiRender]);
    const [contextString, setContextString] = useState(JSON.stringify(data.system_context || {}, null, 2));
    const [jsonError, setJsonError] = useState('');
    const [resultStatus, setResultStatus] = useState<'success' | 'error' | null>(null);

    const terminalRef = useRef<TerminalRef>(null);

    // --- HANDLERS ---

    // Memoize handlers to prevent prop thrashing
    const handleRun = useCallback(() => {
        setIsRunning(true);

        // Log to History
        setHistory(prev => [{
            prompt: prompt || 'Manual Execution',
            command: command,
            timestamp: Date.now(),
            type: 'executed',
            status: 'pending'
        }, ...prev]);

        setTimeout(() => {
            if (terminalRef.current) {
                terminalRef.current.runCommand(command);
            }
        }, 100);
    }, [command, prompt]); // Depends on current command and prompt

    const handleStop = useCallback(() => {
        setIsRunning(false);
        if (terminalRef.current) {
            terminalRef.current.stop();
            toast.info('Interrupt signal sent');
        }
    }, []);

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        try {
            const response = await generateCommand(prompt, id, data.system_context || {});

            // Batch updates
            setUiRender(response.ui_render);
            setCommand(response.ui_render.code_block);

            updateNodeData(id, {
                prompt: prompt,
                command: response.ui_render.code_block,
                ui_render: response.ui_render
            });

            // Add to History
            setHistory(prev => [{
                prompt,
                command: response.ui_render.code_block,
                timestamp: Date.now(),
                type: 'generated'
            }, ...prev]);

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
            setJsonError('');
            setShowSettings(false);
            updateNodeData(id, { system_context: parsed });
            toast.success('Context saved');
        } catch (e) {
            setJsonError('Invalid JSON');
        }
    };

    // --- STYLES ---
    const badge = getBadgeConfig(uiRender?.badge_color);
    const BadgeIcon = badge.icon;

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

    return (
        // OPTIMIZATION 2: 'nowheel' allows scrolling inside node without zooming canvas
        <div className={`relative group transition-[width,height,box-shadow,ring-color] duration-300 ease-in-out nowheel ${isExpanded ? 'w-[800px] h-[500px] z-50' : 'min-w-[420px] h-auto'}`}>

            {/* OPTIMIZATION 3: Conditional Rendering. 
                Only render the heavy gradient div when actually loading. 
                Previously it was just opacity-0 but still eating GPU cycles. */}
            {isLoading && (
                <div className="absolute -inset-[3px] rounded-xl overflow-hidden pointer-events-none">
                    <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#F1F5F9_0%,#6366f1_50%,#a855f7_100%)]" />
                </div>
            )}

            <div className={`
                relative flex flex-col bg-white rounded-xl overflow-hidden h-full
                ${ringClass} ${shadowClass}
                transition-[box-shadow,ring-color] duration-300
            `}>

                {/* --- HEADER --- */}
                <div className="bg-white px-3 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
                    <div className={`
                        p-1.5 rounded-lg flex items-center justify-center transition-colors
                        ${isLoading ? 'bg-indigo-50 text-indigo-600' : 'bg-stone-50 text-stone-600'}
                    `}>
                        <Sparkles size={14} className={isLoading ? 'animate-spin-slow' : ''} />
                    </div>

                    <div className="flex-grow flex flex-col justify-center">
                        {!showSettings ? (
                            // OPTIMIZATION 4: 'nodrag' class prevents React Flow from hijacking focus
                            <input
                                type="text"
                                className="nodrag w-full text-xs font-medium text-gray-700 placeholder:text-gray-400 bg-stone-50 border border-transparent focus:border-indigo-200 focus:bg-white focus:ring-2 focus:ring-indigo-50/50 rounded px-2 py-1 transition-all duration-200"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onBlur={() => updateNodeData(id, { prompt })}
                                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                                placeholder="Describe command..."
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
                                setIsExpanded(newState);
                            }}
                            className={`p-1.5 rounded transition-all ${isTerminalOpen ? 'bg-stone-100 text-stone-800' : 'text-gray-400 hover:text-gray-600 hover:bg-stone-50'}`}
                        >
                            <Terminal size={14} />
                        </button>
                        <button
                            onClick={() => {
                                setShowHistory(!showHistory);
                                setShowSettings(false); // Exclusive toggle
                            }}
                            className={`p-1.5 rounded transition-all ${showHistory ? 'bg-stone-100 text-stone-800' : 'text-gray-400 hover:text-gray-600 hover:bg-stone-50'}`}
                            title="History"
                        >
                            <History size={14} />
                        </button>
                        <button
                            onClick={() => {
                                setShowSettings(!showSettings);
                                setShowHistory(false); // Exclusive toggle
                            }}
                            className={`p-1.5 rounded transition-all ${showSettings ? 'bg-stone-100 text-stone-800' : 'text-gray-400 hover:text-gray-600 hover:bg-stone-50'}`}
                        >
                            <Settings size={14} />
                        </button>
                    </div>
                </div>

                {/* --- BODY --- */}
                <div className="relative flex-grow bg-[#1e1e1e] min-h-[160px] flex flex-col overflow-hidden">

                    {/* Info Overlay (Description & Impact) */}
                    {uiRender && showInfo && !showSettings && (
                        <div className="absolute inset-0 bg-stone-50 z-30 p-3 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Command Details</span>
                                <button onClick={() => setShowInfo(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                            </div>

                            <div className="flex-grow overflow-y-auto space-y-4">
                                {/* Description */}
                                <div className="flex gap-2 items-start">
                                    <Info size={14} className="mt-0.5 text-stone-400 flex-shrink-0" />
                                    <p className="text-xs text-stone-600 leading-relaxed font-medium">
                                        {uiRender.description || "No description provided."}
                                    </p>
                                </div>

                                {/* System Impact */}
                                {uiRender.badge_color !== 'green' && (
                                    <div className="flex gap-2 items-start bg-amber-50 p-2 rounded border border-amber-100/50">
                                        <AlertTriangle size={14} className="mt-0.5 text-amber-500 flex-shrink-0" />
                                        <div>
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide block mb-0.5">
                                                System Impact
                                            </span>
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                {uiRender.system_effect}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Settings Overlay */}
                    {showSettings && (
                        <div className="absolute inset-0 bg-stone-50 z-30 p-3 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] uppercase font-bold text-gray-400">JSON Override</span>
                                {jsonError && <span className="text-[10px] text-rose-500 font-medium">{jsonError}</span>}
                            </div>
                            <textarea
                                className="nodrag flex-grow w-full text-[11px] font-mono leading-relaxed p-3 rounded-lg border bg-white focus:outline-none focus:ring-2 transition-all resize-none border-gray-200 focus:border-indigo-500 focus:ring-indigo-100"
                                value={contextString}
                                onChange={(e) => setContextString(e.target.value)}
                                spellCheck={false}
                            />
                            <div className="flex justify-between mt-3 flex-shrink-0">
                                {/* ... Buttons ... */}
                                <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-700">Cancel</button>
                                <button onClick={handleSaveContext} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded shadow-sm hover:bg-black transition-all"><Save size={10} /> Save</button>
                            </div>
                        </div>
                    )}

                    {/* History Overlay */}
                    {showHistory && (
                        <div className="absolute inset-0 bg-stone-50 z-30 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white">
                                <span className="text-[10px] uppercase font-bold text-gray-400">Generation History</span>
                                <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                            </div>
                            <div className="flex-grow overflow-y-auto p-2 space-y-2 nodrag nowheel">
                                {history.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2">
                                        <History size={24} />
                                        <span className="text-[10px]">No history yet</span>
                                    </div>
                                ) : (
                                    history.map((item, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => {
                                                setPrompt(item.prompt);
                                                setCommand(item.command);
                                                updateNodeData(id, { prompt: item.prompt, command: item.command });
                                                setShowHistory(false);
                                                toast.success('Restored from history');
                                            }}
                                            className="group p-2.5 bg-white rounded-lg border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                                        >
                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {item.type === 'executed' ? (
                                                        item.status === 'success' ? (
                                                            <Check size={10} className="text-emerald-500 shrink-0" />
                                                        ) : item.status === 'failure' ? (
                                                            <X size={10} className="text-rose-500 shrink-0" />
                                                        ) : (
                                                            <Play size={10} className="text-stone-400 shrink-0" />
                                                        )
                                                    ) : (
                                                        <Sparkles size={10} className="text-indigo-500 shrink-0" />
                                                    )}
                                                    <span className="text-[11px] font-semibold text-gray-700 line-clamp-1">{item.prompt}</span>
                                                </div>
                                                <span className="text-[9px] text-gray-400 whitespace-nowrap">
                                                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="text-[10px] font-mono text-gray-500 bg-gray-50 p-1.5 rounded border border-gray-100 line-clamp-2 group-hover:bg-indigo-50/50 group-hover:border-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                {item.command}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Terminal View */}
                    <div className={`absolute inset-0 bg-[#1e1e1e] z-20 flex flex-col transition-opacity duration-200 ${isTerminalOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
                        <div className="h-8 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] border-b border-white/5 flex items-center px-3 gap-2 select-none flex-shrink-0">
                            <div className="flex gap-1.5">
                                <button onClick={() => { setIsTerminalOpen(false); setIsExpanded(false); }} className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] hover:bg-[#FF5F56]/80 flex items-center justify-center text-transparent hover:text-black/50 text-[8px] font-bold">✕</button>
                                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                                <button onClick={() => setIsExpanded(!isExpanded)} className="w-2.5 h-2.5 rounded-full bg-[#27C93F] hover:bg-[#27C93F]/80 flex items-center justify-center text-transparent hover:text-black/50 text-[6px] font-bold">{isExpanded ? <Minimize2 size={6} /> : <Maximize2 size={6} />}</button>
                            </div>
                            <span className="ml-2 text-[10px] text-gray-500 font-mono">bash</span>
                        </div>
                        <div className="flex-grow relative overflow-hidden nodrag">
                            <TerminalComponent
                                ref={terminalRef}
                                hideToolbar={true}
                                onClose={() => setIsTerminalOpen(false)}
                                onCommandComplete={(code) => {
                                    setIsRunning(false);
                                    if (code === 0) {
                                        setResultStatus('success');
                                        toast.success('Execution successful');
                                    } else {
                                        setResultStatus('error');
                                        toast.error(`Exit Code: ${code}`);
                                    }

                                    // Update history status
                                    setHistory(prev => {
                                        const newHistory = [...prev];
                                        const lastPendingIdx = newHistory.findIndex(h => h.type === 'executed' && h.status === 'pending');
                                        if (lastPendingIdx !== -1) {
                                            newHistory[lastPendingIdx] = {
                                                ...newHistory[lastPendingIdx],
                                                status: code === 0 ? 'success' : 'failure'
                                            };
                                        }
                                        return newHistory;
                                    });

                                    setTimeout(() => setResultStatus(null), 3000);
                                }}
                            />
                        </div>
                    </div>

                    {/* Editor View */}
                    <div className={`flex flex-col flex-grow ${isTerminalOpen ? 'invisible' : 'visible'}`}>
                        <div className="relative flex-grow bg-[#1e1e1e] group overflow-hidden flex flex-col">
                            <div className="h-8 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] flex items-center px-3 border-b border-white/5 z-10 flex-shrink-0">
                                <div className="flex gap-1.5 opacity-60">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                                </div>
                            </div>

                            {/* OPTIMIZATION 4: 'nodrag' is critical here */}
                            <textarea
                                className="nodrag w-full h-full bg-[#1e1e1e] text-gray-300 font-mono text-[11px] leading-relaxed p-4 pt-4 border-none focus:ring-0 resize-none outline-none scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent flex-grow"
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                onBlur={() => updateNodeData(id, { command })}
                                placeholder="# Generated command..."
                                spellCheck={false}
                            />
                        </div>
                    </div>
                </div>

                {/* --- FOOTER --- */}
                <div className="bg-white border-t border-gray-100 p-2 flex justify-between items-center gap-2 flex-shrink-0">
                    {!isTerminalOpen && (
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className={`flex-grow flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-all ${isLoading ? 'bg-gray-100 text-gray-400' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600'}`}
                        >
                            {isLoading ? <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" /> : <Sparkles size={12} />}
                            {isLoading ? 'Dreaming...' : 'Generate'}
                        </button>
                    )}

                    {/* RUN / STOP / LOCK LOGIC */}
                    {isRunning ? (
                        <button onClick={handleStop} className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-md text-xs font-semibold hover:bg-rose-100 hover:border-rose-200 transition-all shadow-sm animate-pulse">
                            <Square size={12} className="fill-current" /> Stop
                        </button>
                    ) : isLocked ? (
                        /* LOCKED STATE */
                        <button
                            onClick={() => {
                                setIsLocked(false);
                                toast('Controls Unlocked');
                                // Auto-show info if there is risks
                                if (uiRender?.badge_color !== 'green') {
                                    setShowInfo(true);
                                }
                            }}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-stone-100 text-stone-500 border border-stone-200 rounded-md text-xs font-bold hover:bg-stone-200 hover:text-stone-700 transition-all cursor-pointer w-24 justify-center"
                            title="Click to Unlock"
                        >
                            <Lock size={12} /> LOCKED
                        </button>
                    ) : (
                        /* UNLOCKED / RUN STATE */
                        <div className="flex gap-1">
                            {/* Optional Re-lock button */}
                            {(uiRender?.badge_color === 'red' || uiRender?.badge_color === 'yellow') && (
                                <button
                                    onClick={() => {
                                        setIsLocked(true);
                                        setShowInfo(false);
                                    }}
                                    className="p-1.5 text-stone-400 hover:text-stone-600 rounded"
                                    title="Re-lock"
                                >
                                    <Unlock size={14} />
                                </button>
                            )}

                            {/* Info Toggle */}
                            <button
                                onClick={() => setShowInfo(!showInfo)}
                                className={`p-1.5 rounded transition-colors ${showInfo ? 'bg-indigo-50 text-indigo-600' : 'text-stone-400 hover:text-stone-600'}`}
                                title="Show Info"
                            >
                                <Info size={14} />
                            </button>

                            <button
                                onClick={handleRun}
                                className={`
                                    flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-all
                                    ${uiRender?.badge_color === 'red'
                                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    }
                                `}
                            >
                                <Play size={12} className="fill-current" />
                                {uiRender?.badge_color === 'red' ? 'Run Critical' : 'Run'}
                            </button>
                        </div>
                    )}
                </div>

                <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125 hover:!bg-indigo-500" />
                <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125 hover:!bg-indigo-500" />
            </div>
        </div>
    );
};

// OPTIMIZATION 5: Strict Memoization
export const CommandNode = memo(CommandNodeComponent);