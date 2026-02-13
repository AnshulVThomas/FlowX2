import { Key } from 'lucide-react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';

export default function VaultNodeUI({ id, data }: any) {
    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateNodeData(id, { sudoPassword: e.target.value });
    };

    return (
        <div className="px-4 py-3 shadow-lg rounded-md bg-[#1e1e1e] border border-yellow-600/50 min-w-[200px]">
            <div className="flex items-center gap-2 mb-3 text-yellow-500">
                <Key size={16} />
                <div className="text-sm font-bold tracking-wide uppercase">Credentials Vault</div>
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Sudo Password</label>
                <input
                    type="password"
                    value={data.sudoPassword || ''}
                    onChange={handlePasswordChange}
                    placeholder="••••••••"
                    className="bg-black/40 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors nodrag"
                />
            </div>
            {/* No <Handle /> — this node is intentionally detached */}
        </div>
    );
}
