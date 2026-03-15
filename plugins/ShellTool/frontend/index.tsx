import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import { Terminal, ShieldCheck } from 'lucide-react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';

const ALLOWED_TARGETS = ['reactAgent', 'reactAgentV2'];

// Mirror of backend CAPABILITY_PROFILES keys + display metadata
const PROFILES = [
    { value: 'read_only', label: 'Read Only',  color: '#3b82f6' },
    { value: 'developer', label: 'Developer',  color: '#8b5cf6' },
    { value: 'ops',       label: 'Ops',        color: '#f97316' },
] as const;

type ProfileValue = typeof PROFILES[number]['value'];

const ShellToolUI = ({ id, data, selected }: NodeProps) => {
    const { getNode } = useReactFlow();
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData);

    const isValidConnection = useCallback((connection: any) => {
        const targetNode = getNode(connection.target);
        return !!(targetNode && ALLOWED_TARGETS.includes(targetNode.type || ''));
    }, [getNode]);

    // --- ANIMATION STATE ---
    const isRunning = data.execution_status === 'running';
    const isSuccess = data.execution_status === 'completed';
    const isError   = data.execution_status === 'failed';

    const profile        = (data.capability_profile as ProfileValue) ?? 'read_only';
    const profileMeta    = PROFILES.find(p => p.value === profile) ?? PROFILES[0];

    let borderClass = selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-200 shadow-sm';
    let iconBg      = 'bg-blue-50';
    let iconColor   = 'text-blue-500';

    if (isRunning) {
        borderClass = 'border-transparent shadow-[0_0_40px_-10px_rgba(234,179,8,0.5)]';
        iconBg      = 'bg-yellow-100';
        iconColor   = 'text-yellow-600';
    } else if (isSuccess) {
        borderClass = 'border-emerald-500 shadow-sm';
        iconBg      = 'bg-emerald-50';
        iconColor   = 'text-emerald-500';
    } else if (isError) {
        borderClass = 'border-rose-500 shadow-sm';
        iconBg      = 'bg-rose-50';
        iconColor   = 'text-rose-500';
    }

    const handleProfileChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            e.stopPropagation();
            updateNodeData(id, { capability_profile: e.target.value }, true);
        },
        [id, updateNodeData],
    );

    return (
        <div className="relative group w-[160px]">

            {/* 1. POWER SURGE GLOW (Only when running) */}
            {isRunning && (
                <div className="absolute -inset-[4px] bg-yellow-400/30 rounded-xl blur-md animate-pulse z-0" />
            )}

            {/* 2. SPINNING GRADIENT (Match Command Node thickness) */}
            {isRunning && (
                <div className="absolute -inset-[5px] rounded-xl overflow-hidden pointer-events-none z-0">
                    <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg_at_50%_50%,#fef08a_0%,#eab308_50%,#ca8a04_100%)] animate-[spin_3s_linear_infinite]" />
                </div>
            )}

            <div className={`
                relative flex flex-col gap-2 px-3 py-2 rounded-xl 
                bg-white border-2 transition-all duration-300 z-10
                ${borderClass}
            `}>
                {/* Header row */}
                <div className="flex items-center gap-2 w-full min-w-0">
                    <div className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${iconBg}`}>
                        <Terminal size={14} className={`transition-colors ${iconColor}`} />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[11px] font-bold text-slate-700 truncate">Shell Tool</span>
                        <span className="text-[9px] text-slate-400 truncate">
                            {isRunning ? 'Running...' : 'Sandboxed'}
                        </span>
                    </div>
                </div>

                {/* Capability profile selector */}
                <div className="flex items-center gap-1.5 w-full">
                    <ShieldCheck
                        size={10}
                        className="flex-shrink-0"
                        style={{ color: profileMeta.color }}
                    />
                    <select
                        value={profile}
                        onChange={handleProfileChange}
                        onClick={(e) => e.stopPropagation()}
                        className="
                            flex-1 text-[9px] font-semibold rounded px-1 py-0.5
                            border border-slate-200 bg-slate-50
                            focus:outline-none focus:ring-1 focus:ring-blue-400
                            cursor-pointer transition-colors
                        "
                        style={{ color: profileMeta.color }}
                        title="Capability profile — controls which binaries the agent may run"
                    >
                        {PROFILES.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                </div>

                {/* OUTPUT HANDLE - RESTRICTED */}
                <Handle
                    type="source"
                    position={Position.Bottom}
                    isValidConnection={isValidConnection}
                    className={`!w-3 !h-3 !border-2 !border-white transition-all shadow-sm
                        ${isRunning ? '!bg-yellow-400 animate-pulse' : '!bg-blue-500 hover:!bg-blue-400'}
                    `}
                />
            </div>
        </div>
    );
};
export default memo(ShellToolUI);
