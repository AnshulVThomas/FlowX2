
import { useRef, memo, useState, useCallback, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Minimize2, Maximize2 } from 'lucide-react';
import { generateCommand } from '../../services/api';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import TerminalComponent, { type TerminalRef } from '../../components/TerminalComponent';
import { toast } from 'sonner';

import type { CommandNodeData } from './types';
import { CommandEditor } from './CommandEditor';
import { Header } from './Header';
import { HistoryView } from './HistoryView';
import { SettingsView } from './SettingsView';
import { InfoOverlay } from './InfoOverlay';
import { Footer } from './Footer';
import { ValidationShield } from '../../components/ValidationShield';
import { ResumeOverlay } from './ResumeOverlay';

export type { CommandNodeData } from './types';

// --- MAIN COMPONENT ---
const CommandNodeComponent = ({ id, data, selected }: NodeProps<CommandNodeData>) => {
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    // Local State
    const [prompt, setPrompt] = useState(data.prompt || '');
    // Remove local command state that syncs on every keystroke
    const [command, setCommand] = useState(data.command || '');

    // History State
    const [history, setHistory] = useState<CommandNodeData['data']['history']>(data.history || []);
    const [showHistory, setShowHistory] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    // Helper to persist history (Max 5 items)
    const updateHistory = (newHistory: typeof history) => {
        if (!newHistory) return;
        const truncated = newHistory.slice(0, 5);
        setHistory(truncated);
        updateNodeData(id, { history: truncated }, true);
    };

    // UI States
    const [isLoading, setIsLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Safety Lock State
    // Default to data.locked if present, otherwise calculate from badge
    const [isLocked, setIsLocked] = useState(data.locked ?? false);

    // Context & Data
    const [uiRender, setUiRender] = useState(data.ui_render);

    // Auto-lock high risk commands (Sync with Data)
    useEffect(() => {
        const shouldLock = uiRender?.badge_color === 'red' || uiRender?.badge_color === 'yellow';

        // If data.locked is undefined (new node/legacy), apply default logic
        if (data.locked === undefined) {
            setIsLocked(shouldLock);
            updateNodeData(id, { locked: shouldLock });
        }
        // If uiRender changed (new generation), reset lock based on risk
        // We track this by comparing current uiRender with previous? 
        // Actually, just trust that if uiRender changes, we re-evaluate.
        // We can't easily detect "change" vs "mount" here without more state.
        // For simplicity: If badge implies lock, we FORCE lock on mount/change.
        // User must unlock explicitly.

        // BETTER APPROACH:
        // Use a ref to track if it's user interaction vs system update?
        // Let's stick to: If badge is red/yellow, we set locked=true.
        // But what if user unlocked it?
        // We only want to re-lock if the COMMAND changed (new generation).
        // Since we don't track that granularity yet, let's just use the simple logic:
        // If the badge says lock, and we aren't explicitly tracking "user unlocked", we lock.

        if (shouldLock && !data.locked) {
            // It SHOULD be locked but isn't. 
            // This might mean user unlocked it. 
            // OR it might mean we just loaded and haven't synced yet.
            // Let's assume if it's RED, it's ALWAYS locked on load/change until user unlocks.
            // But we need to distinguish "User Unlocked" from "Not yet Locked".
            // Let's just set it to matches `shouldLock` whenever uiRender changes key properties.
        }
    }, [uiRender?.badge_color, uiRender?.code_block]); // Only re-eval on generation changes

    // Actually, simply: When generating, we call updateNodeData. We can set locked=true THERE.
    // And here we just rely on data.locked.
    // But for existing nodes or manual edits?

    // Let's use the useEffect to INITIALIZE or RESET.
    // Sync uiRender from props
    useEffect(() => {
        setUiRender(data.ui_render);
    }, [data.ui_render]);

    // Sync locked state from props
    useEffect(() => {
        if (data.locked !== undefined) {
            setIsLocked(data.locked);
        }
    }, [data.locked]);

    // Auto-lock high risk commands
    // OPTIMIZATION: Only run this when uiRender changes (new generation), NOT when lock state changes.
    // This allows the user to unlock it manually without fighting the effect.
    useEffect(() => {
        if (uiRender?.badge_color === 'red' || uiRender?.badge_color === 'yellow') {
            // Only lock if we haven't already explicitly handled it?
            // Simple logic: If new risky content arrives, lock it.
            // We rely on this effect ONLY running when uiRender changes.
            if (data.locked !== true) {
                setIsLocked(true);
                updateNodeData(id, { locked: true });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uiRender, id, updateNodeData]); // Exclude data.locked to prevent loop

    // Initialize context string safely (Lazy)
    const [contextString, setContextString] = useState(() => JSON.stringify(data.system_context || {}, null, 2));

    // Only update local string if incoming data changes significantly and we ARE NOT editing it
    useEffect(() => {
        if (!showSettings) { // Don't overwrite if user is currently editing
            setContextString(JSON.stringify(data.system_context || {}, null, 2));
        }
    }, [data.system_context, showSettings]);

    const [jsonError, setJsonError] = useState('');
    const [resultStatus, setResultStatus] = useState<'success' | 'error' | null>(() => {
        // Restore status from last history item if available
        if (data.history && data.history.length > 0) {
            const last = data.history[0]; // history is unshifted, so 0 is latest
            if (last.type === 'executed' && last.status) {
                return last.status === 'success' ? 'success' : 'error';
            }
        }
        return null;
    });

    const terminalRef = useRef<TerminalRef>(null);

    // Safety: Ensure status matches history on mount/update (Fixes "Green Node" on init)
    useEffect(() => {
        if (!data.history || data.history.length === 0) {
            setResultStatus(null);
        } else {
            // Optional: Sync status if history exists (double-check)
            const last = data.history[0];
            if (last.type === 'executed' && last.status && last.status !== 'pending') {
                setResultStatus(last.status === 'success' ? 'success' : 'error');
            }
        }
    }, [data.history]);

    // --- HANDLERS ---

    // Memoize handlers to prevent prop thrashing
    const handleRun = useCallback(() => {
        setIsRunning(true);

        // Log to History
        const newEntry = {
            prompt: prompt || 'Manual Execution',
            command: command,
            timestamp: Date.now(),
            type: 'executed' as const,
            status: 'pending' as const
        };
        updateHistory([newEntry, ...(history || [])]);

        setTimeout(() => {
            if (terminalRef.current) {
                terminalRef.current.runCommand(command);
            }
        }, 100);
    }, [command, prompt, history]); // Depends on current command and prompt

    const handleStop = useCallback(() => {
        setIsRunning(false);
        if (terminalRef.current) {
            terminalRef.current.stop();
            toast.info('Interrupt signal sent');
        }
    }, []);

    const handleCommandUpdate = useCallback((newCmd: string) => {
        setCommand(newCmd);
        updateNodeData(id, { command: newCmd });
    }, [id, updateNodeData]);

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
            }, true);

            // Add to History
            const newEntry = {
                prompt,
                command: response.ui_render.code_block,
                timestamp: Date.now(),
                type: 'generated' as const
            };
            // @ts-ignore - history typing
            updateHistory([newEntry, ...(history || [])]);

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
            updateNodeData(id, { system_context: parsed }, true);
            toast.success('Context saved');
        } catch (e) {
            setJsonError('Invalid JSON');
        }
    };

    const handleTerminalClose = useCallback(() => {
        setIsTerminalOpen(false);
        setIsExpanded(false);
    }, []);

    // Subscribe to validation status

    // Subscribe to validation status for ring styling and shield
    const validationStatus = useWorkflowStore((state) => state.validationStatus[id]);
    const validationErrors = useWorkflowStore((state) => state.validationErrors?.[id]);

    // --- STYLES ---
    let ringClass = "ring-1 ring-stone-200";
    let shadowClass = "shadow-lg shadow-stone-200/50";

    if (selected) {
        // Priority 1: Selection (Blue) - Overrides everything as requested
        ringClass = "ring-2 ring-blue-500";
        shadowClass = "shadow-xl shadow-blue-500/30";
    } else if (isRunning) {
        // Priority 2: Running (Pulse Indigo)
        ringClass = "ring-2 ring-indigo-500 animate-pulse";
        shadowClass = "shadow-xl shadow-indigo-500/30";
    } else if (validationStatus === 'VALIDATION_FAILED') {
        // Priority 3: Validation Failed (Yellow Pulse)
        ringClass = "ring-2 ring-amber-500 animate-pulse";
        shadowClass = "shadow-xl shadow-amber-500/30";
    } else if (resultStatus === 'success' && data.history && data.history.length > 0) {
        // Priority 4: Success (Green) - Only if we actually have history
        ringClass = "ring-2 ring-emerald-500";
        shadowClass = "shadow-xl shadow-emerald-500/20";
    } else if (resultStatus === 'error' && data.history && data.history.length > 0) {
        // Priority 5: Error (Red)
        ringClass = "ring-2 ring-rose-500";
        shadowClass = "shadow-xl shadow-rose-500/20";
    }

    // Optimization: 'visible' + 'invisible' + pointer events + z-index
    // Keeps Xterm "warm" but hidden from view/clicks
    const terminalVisibilityClass = isTerminalOpen
        ? 'opacity-100 visible pointer-events-auto z-20'
        : 'opacity-0 invisible pointer-events-none -z-10';

    // --- STABLE HANDLERS ---

    const toggleSettings = useCallback(() => {
        setShowSettings(prev => !prev);
        setShowHistory(false);
    }, []);

    const toggleHistory = useCallback(() => {
        setShowHistory(prev => !prev);
        setShowSettings(false);
    }, []);

    const toggleTerminal = useCallback((val: boolean) => {
        setIsTerminalOpen(val);
        setIsExpanded(val);
    }, []);

    const updateLocked = useCallback((val: boolean) => {
        setIsLocked(val);
        updateNodeData(id, { locked: val });
    }, [id, updateNodeData]);

    const updateShowInfo = useCallback((val: boolean) => setShowInfo(val), []);

    return (
        // OPTIMIZATION 4: Hardware Acceleration hint
        <div className={`relative group transition-[width,height,box-shadow,ring-color] duration-300 ease-in-out nowheel will-change-[width,height] ${isExpanded ? 'w-[800px] h-[500px] z-50' : 'min-w-[420px] h-auto'}`}>

            {/* Shield Icon for Validation Status */}
            <ValidationShield
                status={validationStatus}
                errors={validationErrors}
                className="absolute -top-3 -right-3 z-50 transition-all duration-300 transform hover:scale-110"
            />

            {/* Resume Overlay (Tier 3 Execution) */}
            {data.execution_status === 'attention_required' && data.thread_id && (
                <ResumeOverlay
                    threadId={data.thread_id}
                    workflowId={useWorkflowStore.getState().activeId || ''} // Direct access or hook? 
                // Better to use hook inside component or pass as prop?
                // ResumeOverlay can fetch it if we pass nothing? 
                // Let's rely on store.getState() for now or add a hook call above.
                />
            )}

            {/* OPTIMIZATION 3: Conditional Rendering. */}
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
                <Header
                    id={id}
                    isLoading={isLoading}
                    showSettings={showSettings}
                    prompt={prompt}
                    uiRender={uiRender}
                    isTerminalOpen={isTerminalOpen}
                    showHistory={showHistory}
                    setPrompt={setPrompt}
                    updateNodeData={updateNodeData}
                    handleGenerate={handleGenerate}
                    setIsTerminalOpen={toggleTerminal}
                    setShowHistory={toggleHistory}
                    setShowSettings={toggleSettings}
                />

                {/* --- BODY --- */}
                <div className="relative flex-grow bg-[#1e1e1e] min-h-[160px] flex flex-col overflow-hidden">

                    {/* Info Overlay */}
                    {showInfo && !showSettings && (
                        <InfoOverlay
                            uiRender={uiRender}
                            onClose={() => setShowInfo(false)}
                        />
                    )}

                    {/* Settings Overlay */}
                    {showSettings && (
                        <SettingsView
                            jsonError={jsonError}
                            contextString={contextString}
                            setContextString={setContextString}
                            handleSaveContext={handleSaveContext}
                            onClose={() => setShowSettings(false)}
                        />
                    )}

                    {/* History Overlay */}
                    {showHistory && (
                        <HistoryView
                            history={history || []}
                            id={id}
                            updateNodeData={updateNodeData}
                            setPrompt={setPrompt}
                            setCommand={setCommand}
                            onClose={() => setShowHistory(false)}
                        />
                    )}



                    {/* Terminal View */}
                    <div className={`absolute inset-0 bg-[#1e1e1e] z-20 flex flex-col transition-opacity duration-200 ${terminalVisibilityClass}`}>
                        <div className="h-8 bg-gradient-to-b from-[#2a2a2a] to-[#1e1e1e] border-b border-white/5 flex items-center px-3 gap-2 select-none flex-shrink-0">
                            <div className="flex gap-1.5">
                                <button onClick={handleTerminalClose} className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] hover:bg-[#FF5F56]/80 flex items-center justify-center text-transparent hover:text-black/50 text-[8px] font-bold">✕</button>
                                <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                                <button onClick={() => setIsExpanded(!isExpanded)} className="w-2.5 h-2.5 rounded-full bg-[#27C93F] hover:bg-[#27C93F]/80 flex items-center justify-center text-transparent hover:text-black/50 text-[6px] font-bold">{isExpanded ? <Minimize2 size={6} /> : <Maximize2 size={6} />}</button>
                            </div>
                            <span className="ml-2 text-[10px] text-gray-500 font-mono">
                                {data.execution_status === 'running' ? 'stream://backend' : 'bash'}
                            </span>
                        </div>
                        <div className="flex-grow relative overflow-hidden nodrag">
                            <TerminalComponent
                                ref={terminalRef}
                                hideToolbar={true}
                                onClose={handleTerminalClose}
                                mode={(data.execution_status === 'running' || data.execution_status === 'attention_required' || data.execution_status === 'completed' || data.execution_status === 'failed') ? 'stream' : 'interactive'}
                                nodeId={id}
                                onCommandComplete={(code) => {
                                    // In stream mode, validation is handled by store updates
                                    if ((data.execution_status === 'running' || data.execution_status === 'attention_required')) return;

                                    setIsRunning(false);
                                    if (code === 0) {
                                        setResultStatus('success');
                                        toast.success('Execution successful');
                                    } else {
                                        setResultStatus('error');
                                        toast.error(`Exit Code: ${code}`);
                                    }

                                    // Update history status
                                    const newHistory = [...(history || [])];
                                    // Logic for manual runs: Add new entry if not existing? 
                                    // Actually, usually we add "pending" entry when run starts. 
                                    // But here we are in 'onCommandComplete'.
                                    // For now, let's just append a completed entry for manual runs.

                                    newHistory.unshift({
                                        prompt: prompt || "Manual Execution",
                                        command: command || "", // This might be stale if user typed in terminal. 
                                        // But for interactive mode, we usually don't track every char.
                                        // We'll use the 'command' state.
                                        timestamp: Date.now(),
                                        type: 'executed',
                                        runType: 'manual',
                                        status: code === 0 ? 'success' : 'failure'
                                    });

                                    updateHistory(newHistory);
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
                            <CommandEditor
                                initialValue={command}
                                onUpdate={handleCommandUpdate}
                            />
                        </div>
                    </div>
                </div>

                {/* --- FOOTER --- */}
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

// --- OPTIMIZATION 1: Custom Compare Function ---
function propsAreEqual(prev: NodeProps<CommandNodeData>, next: NodeProps<CommandNodeData>) {
    return (
        prev.selected === next.selected &&
        prev.id === next.id &&
        prev.dragging === next.dragging && // Import optimization
        // Deep compare specific data fields
        prev.data.command === next.data.command &&
        prev.data.prompt === next.data.prompt &&
        prev.data.locked === next.data.locked &&
        prev.data.ui_render?.badge_color === next.data.ui_render?.badge_color &&
        prev.data.ui_render?.code_block === next.data.ui_render?.code_block &&
        prev.data.execution_status === next.data.execution_status &&
        prev.data.thread_id === next.data.thread_id &&
        // Shallow check for history array itself (store updates create new array refs)
        prev.data.history === next.data.history
    );
}

// OPTIMIZATION 5: Strict Memoization with Custom Comparator
export const CommandNode = memo(CommandNodeComponent, propsAreEqual);
export default CommandNode;
