import { useRef, memo, useState, useCallback, useMemo, useEffect } from 'react'; // Added useMemo
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Minimize2, Maximize2 } from 'lucide-react';
import { generateCommand } from '@core/services/api';
import { useWorkflowStore } from '@core/store/useWorkflowStore';
import TerminalComponent, { type TerminalRef } from '@core/components/TerminalComponent';
import { toast } from 'sonner';

import type { CommandNodeData } from './types';
import { CommandEditor } from './CommandEditor';
import { Header } from './Header';
import { HistoryView } from './HistoryView';
import { SettingsView } from './SettingsView';
import { InfoOverlay } from './InfoOverlay';
import { Footer } from './Footer';
import { ValidationShield } from '@core/components/ValidationShield';
import { ResumeOverlay } from './ResumeOverlay';

export type { CommandNodeData } from './types';

// --- MAIN COMPONENT ---
const CommandNodeComponent = ({ id, data, selected }: NodeProps<CommandNodeData>) => {
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    // OPTIMIZATION 1: REMOVED REDUNDANT LOCAL STATE
    // We use data.command, data.history, data.locked, data.ui_render directly.
    // We ONLY keep local state for UI interactions (modals, prompt input).

    // Local UI State
    const [prompt, setPrompt] = useState(data.prompt || '');
    const [isLoading, setIsLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    // Tab State
    const [activeTab, setActiveTab] = useState<'stream' | 'interactive'>('stream');

    // Derived State (Cheap)
    // Safety: Default locked status logic moved to Effect or Store actions. 
    // Here we just read it.
    const isLocked = data.locked ?? false;
    const uiRender = data.ui_render;
    const history = data.history || [];

    // --- AUTO-LOCK EFFECT ---
    // Only runs when generation changes risk level
    useEffect(() => {
        const shouldLock = uiRender?.badge_color === 'red' || uiRender?.badge_color === 'yellow';
        if (shouldLock && !data.locked) {
            updateNodeData(id, { locked: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uiRender?.badge_color]); // Minimal dependency

    // --- AUTO-TAB EFFECT ---
    useEffect(() => {
        if (data.execution_status === 'running' || data.execution_status === 'attention_required') {
            setActiveTab('stream');
            setIsTerminalOpen(true);
        }
    }, [data.execution_status]);

    // --- MEMOIZED HANDLERS (Prevents Child Re-renders) ---

    // OPTIMIZATION 2: Stable Callback for Terminal
    const onInteractiveComplete = useCallback((code: number) => {
        setIsRunning(false);
        if (code === 0) toast.success('Manual Command Executed');
        else toast.error(`Exit Code: ${code}`);

        // Update History directly via Store
        const newEntry = {
            prompt: prompt || "Manual Execution", // Capture current prompt closure
            command: data.command || "",         // Use fresh data
            timestamp: Date.now(),
            type: 'executed' as const,
            runType: 'manual' as const,
            status: code === 0 ? 'success' as const : 'failure' as const
        };

        // We must calculate new history based on LATEST data prop, not stale closure
        // However, 'data' in deps might be stale if we don't include it. 
        // Better strategy: Pass a functional update if we had local state, 
        // but here we just read data.history which is updated via props.
        const currentHistory = data.history || [];
        const newHistory = [newEntry, ...currentHistory].slice(0, 5);

        updateNodeData(id, { history: newHistory }, true);
    }, [id, prompt, data.command, data.history, updateNodeData]);

    const handleRun = useCallback(() => {
        setIsRunning(true);
        // Optimistic History Update (Pending)
        const newEntry = {
            prompt: prompt || 'Manual Execution',
            command: data.command || "",
            timestamp: Date.now(),
            type: 'executed' as const,
            status: 'pending' as const
        };
        const newHistory = [newEntry, ...(data.history || [])].slice(0, 5);
        updateNodeData(id, { history: newHistory }, true);

        // Small timeout to allow UI to settle before Xterm takes over
        setTimeout(() => {
            if (terminalRef.current) {
                terminalRef.current.runCommand(data.command || "");
            }
        }, 50);
    }, [id, prompt, data.command, data.history, updateNodeData]);

    const handleStop = useCallback(() => {
        setIsRunning(false);
        if (terminalRef.current) terminalRef.current.stop();
        toast.info('Interrupt signal sent');
    }, []);

    const handleCommandUpdate = useCallback((newCmd: string) => {
        // Direct Store Update (Single Source of Truth)
        updateNodeData(id, { command: newCmd });
    }, [id, updateNodeData]);

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsLoading(true);
        try {
            const response = await generateCommand(prompt, id, data.system_context || {});

            // Single Batch Update
            updateNodeData(id, {
                prompt: prompt,
                command: response.ui_render.code_block,
                ui_render: response.ui_render,
                // Add to history immediately
                history: [{
                    prompt,
                    command: response.ui_render.code_block,
                    timestamp: Date.now(),
                    type: 'generated'
                }, ...(data.history || [])].slice(0, 5)
            }, true);

            toast.success('Command generated');
        } catch (error) {
            console.error(error);
            toast.error('Generation failed');
        } finally {
            setIsLoading(false);
        }
    };

    // OPTIMIZATION 3: Memoized Context String
    // We only re-calculate this string when the modal opens or data changes
    const contextString = useMemo(() =>
        JSON.stringify(data.system_context || {}, null, 2),
        [data.system_context]);

    const [localContextString, setLocalContextString] = useState(contextString);

    // Sync local context string only when opening settings (optional, logic simplifies to just using local state when editing)
    useEffect(() => {
        if (!showSettings) setLocalContextString(contextString);
    }, [contextString, showSettings]);

    const handleSaveContext = () => {
        try {
            const parsed = JSON.parse(localContextString);
            // setJsonError(''); // Not defined in User snippet, but used? 
            // Wait, user provided snippet calls `setJsonError`. 
            // BUT `setJsonError` is NOT defined in the user snippet's component body.
            // Oh, I see `[jsonError, setJsonError]` is MISSING from the user snippet component body!
            // I must add it back or the code will crash.
            // Let me check the user snippet again.
            // ...
            // const [prompt, setPrompt] = useState(data.prompt || '');
            // const [isLoading, setIsLoading] = useState(false);
            // ...
            // It seems user forgot to include `jsonError` state in their snippet?
            // "Optimized CommandNode/index.tsx" snippet in prompt:
            // It does NOT have `const [jsonError, setJsonError] = useState('');`
            // But it calls `setJsonError` in `handleSaveContext`.
            // I should ADD it.

            // Also check `updateNodeData` import? It's mapped from store.
            // It uses `updateNodeData` from `useWorkflowStore`.

            setShowSettings(false);
            updateNodeData(id, { system_context: parsed }, true);
            toast.success('Context saved');
        } catch (e) {
            setJsonError('Invalid JSON');
            toast.error('Invalid JSON');
        }
    };

    // I will include the missing state for completeness if possible, or just fix the usage.
    // The user's snippet uses `setJsonError`. So I MUST define it.

    const [jsonError, setJsonError] = useState('');

    // --- VIEW LOGIC ---
    const terminalRef = useRef<TerminalRef>(null);

    // Validation Status Subscription
    const validationStatus = useWorkflowStore((state) => state.validationStatus[id]);
    const validationErrors = useWorkflowStore((state) => state.validationErrors?.[id]);

    // Border Logic (Memoized or just computed)
    let ringClass = "ring-1 ring-stone-200";
    let shadowClass = "shadow-lg shadow-stone-200/50";

    // ... (Keep your styling logic, it's efficient enough) ...
    // Note: data.execution_status access is direct now.
    if (selected) {
        ringClass = "ring-2 ring-blue-500";
        shadowClass = "shadow-xl shadow-blue-500/30";
    } else if (isRunning || data.execution_status === 'running') {
        // Match the Purple/Fuchsia border animation
        ringClass = "ring-1 ring-purple-500/50";
        shadowClass = "shadow-xl shadow-purple-500/20";
    } else if (data.execution_status === 'attention_required') {
        ringClass = "ring-2 ring-amber-500 animate-pulse";
        shadowClass = "shadow-xl shadow-amber-500/30";
    } else if (validationStatus === 'VALIDATION_FAILED') {
        ringClass = "ring-2 ring-amber-500 animate-pulse";
        shadowClass = "shadow-xl shadow-amber-500/30";
    } else if (data.execution_status === 'failed') {
        ringClass = "ring-2 ring-rose-500";
        shadowClass = "shadow-xl shadow-rose-500/20";
    } else if (data.execution_status === 'completed') {
        ringClass = "ring-2 ring-emerald-500";
        shadowClass = "shadow-xl shadow-emerald-500/20";
    }

    const terminalVisibilityClass = isTerminalOpen
        ? 'opacity-100 visible pointer-events-auto z-20'
        : 'opacity-0 invisible pointer-events-none -z-10';

    // Toggle Handlers
    const toggleSettings = useCallback(() => { setShowSettings(p => !p); setShowHistory(false); }, []);
    const toggleHistory = useCallback(() => { setShowHistory(p => !p); setShowSettings(false); }, []);
    const toggleTerminal = useCallback((val: boolean) => { setIsTerminalOpen(val); setIsExpanded(val); }, []);
    const handleTerminalClose = useCallback(() => { setIsTerminalOpen(false); setIsExpanded(false); }, []);
    const updateLocked = useCallback((val: boolean) => updateNodeData(id, { locked: val }), [id, updateNodeData]);
    const updateShowInfo = useCallback((val: boolean) => setShowInfo(val), []);

    // Helper for terminal connection
    const shouldConnectStream = ['running', 'completed', 'failed', 'attention_required'].includes(data.execution_status || '');
    const shouldConnectInteractive = activeTab === 'interactive';

    return (
        <div className={`relative group transition-[width,height,box-shadow,ring-color] duration-300 ease-in-out nowheel will-change-[width,height] ${isExpanded ? 'w-[800px] h-[500px] z-50' : 'min-w-[420px] h-auto'}`}>

            <ValidationShield status={validationStatus} errors={validationErrors} className="absolute -top-3 -right-3 z-50 transition-all duration-300 transform hover:scale-110" />

            {data.execution_status === 'attention_required' && data.thread_id && (
                <ResumeOverlay threadId={data.thread_id} workflowId={useWorkflowStore.getState().activeId || ''} />
            )}

            {isLoading && (
                <div className="absolute -inset-[3px] rounded-xl overflow-hidden pointer-events-none">
                    <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#F1F5F9_0%,#6366f1_50%,#a855f7_100%)]" />
                </div>
            )}

            {(isRunning || data.execution_status === 'running') && (
                <div className="absolute -inset-[5px] rounded-xl overflow-hidden pointer-events-none">
                    <div className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#F1F5F9_0%,#a855f7_50%,#d946ef_100%)]" />
                </div>
            )}

            <div className={`relative flex flex-col bg-white rounded-xl overflow-hidden h-full ${ringClass} ${shadowClass} transition-[box-shadow,ring-color] duration-300`}>

                <Header
                    id={id}
                    isLoading={isLoading}
                    showSettings={showSettings}
                    prompt={prompt}
                    uiRender={uiRender}
                    isTerminalOpen={isTerminalOpen}
                    showHistory={showHistory}
                    sudoLock={data.sudoLock}
                    setPrompt={setPrompt}
                    updateNodeData={updateNodeData}
                    handleGenerate={handleGenerate}
                    setIsTerminalOpen={toggleTerminal}
                    setShowHistory={toggleHistory}
                    setShowSettings={toggleSettings}
                />

                <div className="relative flex-grow bg-[#1e1e1e] min-h-[160px] flex flex-col overflow-hidden">
                    {/* Overlays */}
                    {showInfo && !showSettings && <InfoOverlay uiRender={uiRender} onClose={() => setShowInfo(false)} />}

                    {showSettings && (
                        <SettingsView
                            jsonError={jsonError}
                            contextString={localContextString}
                            setContextString={setLocalContextString}
                            handleSaveContext={handleSaveContext}
                            onClose={() => setShowSettings(false)}
                        />
                    )}

                    {showHistory && (
                        <HistoryView
                            history={history}
                            id={id}
                            updateNodeData={updateNodeData}
                            setPrompt={setPrompt}
                            setCommand={(cmd) => updateNodeData(id, { command: cmd })} // Simple inline update
                            onClose={() => setShowHistory(false)}
                        />
                    )}

                    {/* Dual Terminal View */}
                    <div className={`absolute inset-0 bg-[#1e1e1e] z-20 flex flex-col transition-opacity duration-200 ${terminalVisibilityClass}`}>

                        {/* Tab Bar Header */}
                        <div className="h-8 bg-[#252526] border-b border-black/20 flex items-center justify-between select-none flex-shrink-0">
                            <div className="flex h-full">
                                <button
                                    onClick={() => setActiveTab('stream')}
                                    className={`flex items-center gap-2 px-4 h-full text-[10px] font-medium transition-colors ${activeTab === 'stream' ? 'bg-[#1e1e1e] text-white border-t-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2a2b]'}`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${data.execution_status === 'running' ? 'bg-indigo-500 animate-pulse' : 'bg-gray-400'}`} />
                                    OUTPUT
                                </button>
                                <button
                                    onClick={() => setActiveTab('interactive')}
                                    className={`flex items-center gap-2 px-4 h-full text-[10px] font-medium transition-colors ${activeTab === 'interactive' ? 'bg-[#1e1e1e] text-white border-t-2 border-emerald-500' : 'text-gray-500 hover:text-gray-300 hover:bg-[#2a2a2b]'}`}
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    TERMINAL
                                </button>
                            </div>
                            <div className="flex items-center px-3 gap-2">
                                <span className="mr-2 text-[9px] text-gray-600 font-mono">{activeTab === 'stream' ? 'READ-ONLY' : 'BASH'}</span>
                                <div className="flex gap-1.5">
                                    <button onClick={handleTerminalClose} className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] hover:opacity-80 flex items-center justify-center text-transparent hover:text-black/50 text-[8px] font-bold">✕</button>
                                    <button onClick={() => setIsExpanded(!isExpanded)} className="w-2.5 h-2.5 rounded-full bg-[#27C93F] hover:opacity-80 flex items-center justify-center text-transparent hover:text-black/50 text-[6px] font-bold">{isExpanded ? <Minimize2 size={6} /> : <Maximize2 size={6} />}</button>
                                </div>
                            </div>
                        </div>

                        {/* Terminals Container */}
                        <div className="flex-grow relative overflow-hidden nodrag">
                            <div className={`absolute inset-0 bg-[#1e1e1e] ${activeTab === 'stream' ? 'z-10 visible' : 'z-0 invisible'}`}>
                                <TerminalComponent
                                    hideToolbar={true}
                                    onClose={handleTerminalClose}
                                    mode="stream"
                                    nodeId={id}
                                    shouldConnect={shouldConnectStream}
                                    initialLogs={data.logs}
                                    runId={data.thread_id} // Pass thread_id to force clear on new run
                                />
                            </div>
                            <div className={`absolute inset-0 bg-[#1e1e1e] ${activeTab === 'interactive' ? 'z-10 visible' : 'z-0 invisible'}`}>
                                <TerminalComponent
                                    ref={terminalRef}
                                    hideToolbar={true}
                                    onClose={handleTerminalClose}
                                    mode="interactive"
                                    nodeId={id}
                                    shouldConnect={shouldConnectInteractive}
                                    onCommandComplete={onInteractiveComplete} // PASS MEMOIZED CALLBACK
                                    sudo={data.sudoLock}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={`flex flex-col flex-grow ${isTerminalOpen ? 'invisible' : 'visible'}`}>
                        <div className="relative flex-grow bg-[#1e1e1e] group overflow-hidden flex flex-col">
                            <div className="h-8 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] flex items-center px-3 border-b border-white/5 z-10 flex-shrink-0">
                                <div className="flex gap-1.5 opacity-60">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                                </div>
                            </div>
                            <CommandEditor
                                initialValue={data.command || ""} // Use data directly
                                onUpdate={handleCommandUpdate}
                            />
                        </div>
                    </div>
                </div>

                <Footer
                    isTerminalOpen={isTerminalOpen}
                    isLoading={isLoading}
                    isRunning={isRunning}
                    isLocked={isLocked}
                    uiRender={uiRender}
                    showInfo={showInfo}
                    handleGenerate={handleGenerate}
                    handleStop={handleStop}
                    handleRun={handleRun}
                    setIsLocked={updateLocked}
                    setShowInfo={updateShowInfo}
                />

                <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125 hover:!bg-indigo-500" />
                <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125 hover:!bg-indigo-500" />
            </div>
        </div>
    );
};

// --- COMPARATOR ---
function propsAreEqual(prev: NodeProps<CommandNodeData>, next: NodeProps<CommandNodeData>) {
    return (
        prev.selected === next.selected &&
        prev.id === next.id &&
        prev.dragging === next.dragging &&
        prev.data.command === next.data.command &&
        prev.data.prompt === next.data.prompt &&
        prev.data.locked === next.data.locked &&
        prev.data.ui_render?.badge_color === next.data.ui_render?.badge_color &&
        prev.data.ui_render?.code_block === next.data.ui_render?.code_block &&
        prev.data.execution_status === next.data.execution_status &&
        prev.data.thread_id === next.data.thread_id &&
        prev.data.thread_id === next.data.thread_id &&
        prev.data.history === next.data.history &&
        // OPTIMIZATION: Check log length to trigger updates for buffered logs that might have been missed by event listener
        // But only if we are actually viewing them (optimization opportunity: check if terminal is open?)
        // For correctness, we should verify. 
        (prev.data.logs?.length || 0) === (next.data.logs?.length || 0)
    );
}

export const CommandNode = memo(CommandNodeComponent, propsAreEqual);
export default CommandNode;
