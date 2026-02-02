import { memo } from 'react';
import { History, X, Check, Play, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface HistoryViewProps {
    history: Array<{
        prompt: string;
        command: string;
        timestamp: number;
        type: 'generated' | 'executed';
        status?: 'success' | 'failure' | 'pending';
    }>;
    id: string;
    updateNodeData: (id: string, data: Partial<any>) => void;
    setPrompt: (val: string) => void;
    setCommand: (val: string) => void;
    onClose: () => void;
}

export const HistoryView = memo(({ history, id, updateNodeData, setPrompt, setCommand, onClose }: HistoryViewProps) => {
    return (
        <div className="absolute inset-0 bg-stone-50 z-30 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white">
                <span className="text-[10px] uppercase font-bold text-gray-400">Generation History</span>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
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
                                onClose();
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
    );
});
