import { useMemo } from "react";
import { useWorkflowStore } from "../../store/useWorkflowStore";
import { Activity, X, Server, Terminal, Play, GitMerge, Shield } from "lucide-react";
import { ValidationShield } from "../ValidationShield";
import { loadPlugins, type PluginManifest } from "../../registry/pluginLoader";

// Load plugin metadata once
const { toolsMenu } = loadPlugins();
const manifestMap = new Map<string, PluginManifest>(toolsMenu.map(m => [m.id, m]));

// Icon per node type
const ICON_MAP: Record<string, React.ReactElement> = {
    startNode: <Play size={14} className="text-blue-400" />,
    commandNode: <Terminal size={14} className="text-gray-400" />,
    orMergeNode: <GitMerge size={14} className="text-amber-400" />,
    vaultNode: <Shield size={14} className="text-yellow-400" />,
};

// Category display order
const CATEGORY_ORDER = ['Core', 'System', 'Flow Control', 'Configuration'];

const getNodeLabel = (node: any) => {
    const manifest = manifestMap.get(node.type || '');
    if (node.data?.ui_render?.title) return node.data.ui_render.title;
    if (node.data?.name) return node.data.name;
    return manifest?.name || node.type || 'Unknown';
};

const getStatusBadge = (status: string) => {
    switch (status) {
        case 'running': case 'pending':
            return { cls: 'bg-indigo-500/20 text-indigo-300', label: 'RUNNING' };
        case 'success': case 'completed':
            return { cls: 'bg-emerald-500/20 text-emerald-300', label: 'SUCCESS' };
        case 'failure': case 'failed':
            return { cls: 'bg-rose-500/20 text-rose-300', label: 'ERROR' };
        case 'skipped':
            return { cls: 'bg-gray-500/20 text-gray-400', label: 'SKIPPED' };
        case 'attention_required':
            return { cls: 'bg-yellow-500/20 text-yellow-300 animate-pulse', label: 'WAITING' };
        default:
            return { cls: 'bg-gray-500/20 text-gray-400', label: 'IDLE' };
    }
};

// --- INNER COMPONENT (Only renders when Open) ---
const ProcessList = () => {
    const nodes = useWorkflowStore((state) => state.nodes);
    const validationStatus = useWorkflowStore((state) => state.validationStatus);
    const validationErrors = useWorkflowStore((state) => state.validationErrors);

    // Group nodes by category from manifest
    const grouped = useMemo(() => {
        const groups: Record<string, any[]> = {};
        for (const node of nodes) {
            const manifest = manifestMap.get(node.type || '');
            if (!manifest) continue;
            if (manifest.executable === false) continue; // Non-executable config nodes
            const cat = manifest.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(node);
        }
        return groups;
    }, [nodes]);

    const sortedCategories = CATEGORY_ORDER.filter(c => grouped[c]?.length);
    // Add any categories not in the predefined order
    for (const cat of Object.keys(grouped)) {
        if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
    }

    if (sortedCategories.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500 gap-2">
                <Server size={24} className="opacity-20" />
                <span className="text-sm">No nodes in workflow</span>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {sortedCategories.map(category => (
                <div key={category}>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                            {category}
                        </span>
                        <span className="text-[10px] text-gray-600">
                            ({grouped[category].length})
                        </span>
                        <div className="flex-1 border-t border-white/5" />
                    </div>
                    <div className="space-y-2">
                        {grouped[category].map((node: any) => {
                            const status = node.data?.execution_status || 'idle';
                            const badge = getStatusBadge(status);
                            const manifest = manifestMap.get(node.type || '');

                            return (
                                <div key={node.id} className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-2 mb-1">
                                        {ICON_MAP[node.type] || <Terminal size={14} className="text-gray-400" />}
                                        <span className="text-sm font-medium text-gray-200 truncate flex-grow">
                                            {getNodeLabel(node)}
                                        </span>
                                        <ValidationShield status={validationStatus[node.id]} errors={validationErrors?.[node.id]} />
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500 truncate max-w-[150px]" title={manifest?.name}>
                                            {manifest?.name || node.type}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${badge.cls}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- MAIN COMPONENT ---
export function ProcessSidebar() {
    const isOpen = useWorkflowStore((state) => state.isProcessSidebarOpen);
    const toggle = useWorkflowStore((state) => state.toggleProcessSidebar);

    return (
        <div
            className={`
                fixed right-0 top-0 bottom-0 z-40
                w-80 bg-black/80 backdrop-blur-xl border-l border-white/10
                transform transition-transform duration-300 ease-in-out
                flex flex-col
                ${isOpen ? 'translate-x-0' : 'translate-x-full'}
            `}
        >
            <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 text-gray-200">
                    <Activity size={18} className="text-blue-400" />
                    <span className="font-semibold">Active Processes</span>
                </div>
                <button
                    onClick={toggle}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {isOpen && <ProcessList />}
            </div>
        </div>
    );
}
