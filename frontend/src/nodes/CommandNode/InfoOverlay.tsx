
import { X, Info, AlertTriangle } from 'lucide-react';
import type { CommandNodeData } from './types';

interface InfoOverlayProps {
    uiRender: CommandNodeData['data']['ui_render'];
    onClose: () => void;
}

export const InfoOverlay = ({ uiRender, onClose }: InfoOverlayProps) => {
    if (!uiRender) return null;

    return (
        <div className="absolute inset-0 bg-stone-50 z-30 p-3 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                <span className="text-[10px] uppercase font-bold text-gray-400">Command Details</span>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
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
    );
};
