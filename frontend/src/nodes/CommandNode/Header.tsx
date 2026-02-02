import { Terminal, History, Settings, Sparkles, Check, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { CommandNodeData } from './types';

// Helper for badge config (moved from main file)
const getBadgeConfig = (color?: string) => {
    switch (color) {
        case 'green': return { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20', icon: Check, label: 'SAFE' };
        case 'red': return { bg: 'bg-rose-500/10', text: 'text-rose-600', border: 'border-rose-500/20', icon: ShieldAlert, label: 'CRITICAL' };
        default: return { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/20', icon: AlertTriangle, label: 'CAUTION' };
    }
};

interface HeaderProps {
    id: string;
    isLoading: boolean;
    showSettings: boolean;
    prompt: string;
    uiRender?: CommandNodeData['data']['ui_render'];
    isTerminalOpen: boolean;
    showHistory: boolean;
    setPrompt: (val: string) => void;
    updateNodeData: (id: string, data: Partial<any>) => void;
    handleGenerate: () => void;
    setIsTerminalOpen: (val: boolean) => void;
    setIsExpanded: (val: boolean) => void;
    setShowHistory: (val: boolean) => void;
    setShowSettings: (val: boolean) => void;
}

export const Header = ({
    id,
    isLoading,
    showSettings,
    prompt,
    uiRender,
    isTerminalOpen,
    showHistory,
    setPrompt,
    updateNodeData,
    handleGenerate,
    setIsTerminalOpen,
    setIsExpanded,
    setShowHistory,
    setShowSettings
}: HeaderProps) => {
    const badge = getBadgeConfig(uiRender?.badge_color);
    const BadgeIcon = badge.icon;

    return (
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
    );
};
