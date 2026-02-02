
import { Save } from 'lucide-react';

interface SettingsViewProps {
    jsonError: string;
    contextString: string;
    setContextString: (val: string) => void;
    handleSaveContext: () => void;
    onClose: () => void;
}

export const SettingsView = ({ jsonError, contextString, setContextString, handleSaveContext, onClose }: SettingsViewProps) => {
    return (
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
                <button onClick={onClose} className="px-3 py-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={handleSaveContext} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded shadow-sm hover:bg-black transition-all"><Save size={10} /> Save</button>
            </div>
        </div>
    );
};
