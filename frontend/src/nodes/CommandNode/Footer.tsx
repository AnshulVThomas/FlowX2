import { Sparkles, Square, Lock, Unlock, Info, Play } from 'lucide-react';
import type { CommandNodeData } from './types';

interface FooterProps {
    isTerminalOpen: boolean;
    isLoading: boolean;
    isRunning: boolean;
    isLocked: boolean;
    uiRender?: CommandNodeData['data']['ui_render'];
    showInfo: boolean;
    handleGenerate: () => void;
    handleStop: () => void;
    handleRun: () => void;
    setIsLocked: (val: boolean) => void;
    setShowInfo: (val: boolean) => void;
}

export const Footer = ({
    isTerminalOpen,
    isLoading,
    isRunning,
    isLocked,
    uiRender,
    showInfo,
    handleGenerate,
    handleStop,
    handleRun,
    setIsLocked,
    setShowInfo
}: FooterProps) => {
    return (
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
    );
};
