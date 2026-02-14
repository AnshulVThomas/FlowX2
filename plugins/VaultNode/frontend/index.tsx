import { Key } from 'lucide-react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';

export default function VaultNodeUI({ id, data, selected }: any) {
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateNodeData(id, { sudoPassword: e.target.value });
    };

    let borderClass = 'border-stone-200';
    let ringClass = '';
    let shadowClass = 'shadow-lg shadow-stone-200/50';

    if (selected) {
        borderClass = 'border-blue-500';
        ringClass = 'ring-2 ring-blue-500';
        shadowClass = 'shadow-xl shadow-blue-500/30';
    }

    return (
        <div className={`
            p-3 rounded-2xl bg-white 
            border transition-all duration-300 min-w-[220px]
            ${borderClass}
            ${ringClass}
            ${shadowClass}
        `}>
            {/* Header Area */}
            <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl w-10 h-10 flex items-center justify-center bg-orange-50 border border-orange-100 text-orange-600 shadow-sm">
                    <Key size={18} />
                </div>
                <div className="flex flex-col">
                    <div className="text-[13px] font-bold text-gray-800 leading-tight">Credentials Vault</div>
                    <div className="text-[10px] font-semibold tracking-wide uppercase text-orange-500/80 mt-0.5">Secure Storage</div>
                </div>
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-1.5 group/input">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Sudo Password</label>

                <input
                    type="password"
                    value={data.sudoPassword || ''}
                    onChange={handlePasswordChange}
                    placeholder="••••••••"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 
                    placeholder-gray-300
                    focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 
                    shadow-sm transition-all nodrag"
                />
            </div>

            {/* Decorative bottom accent only if password exists */}
            {data.sudoPassword && (
                <div className="mt-3 flex items-center justify-between px-1">
                    <span className="text-[10px] text-orange-600 font-medium flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        Active
                    </span>
                    <span className="text-[9px] text-gray-300 font-mono">ENCRYPTED</span>
                </div>
            )}
        </div>
    );
}
