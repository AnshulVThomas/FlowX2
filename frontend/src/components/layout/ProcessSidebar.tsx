import { useWorkflowStore } from "../../store/useWorkflowStore";
import { Activity, X, Server, Terminal } from "lucide-react";
import type { CommandNodeData } from "../../nodes/CommandNode";
import { ValidationShield } from "../ValidationShield";

export function ProcessSidebar() {
    const isOpen = useWorkflowStore((state) => state.isProcessSidebarOpen);
    const toggle = useWorkflowStore((state) => state.toggleProcessSidebar);
    const nodes = useWorkflowStore((state) => state.nodes);
    const validationStatus = useWorkflowStore((state) => state.validationStatus);
    const validationErrors = useWorkflowStore((state) => state.validationErrors);

    // Filter for "Process" like nodes (Command Nodes) and cast type
    const processNodes = nodes.filter((n): n is CommandNodeData => n.type === 'commandNode');

    // Helper to derive status from history
    const getStatus = (node: CommandNodeData) => {
        if (node.data.history && node.data.history.length > 0) {
            const last = node.data.history[0];
            if (last.type === 'executed' && last.status) {
                return last.status;
            }
        }
        return 'idle';
    };

    return (
        <div
            className={`
                fixed right-0 top-16 bottom-0 z-40
                w-80 bg-black/80 backdrop-blur-xl border-l border-white/10
                transform transition-transform duration-300 ease-in-out
                flex flex-col
                ${isOpen ? 'translate-x-0' : 'translate-x-full'}
            `}
        >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
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

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {processNodes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-500 gap-2">
                        <Server size={24} className="opacity-20" />
                        <span className="text-sm">No active processes</span>
                    </div>
                ) : (
                    processNodes.map(node => {
                        const status = getStatus(node);
                        return (
                            <div key={node.id} className="bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <Terminal size={14} className="text-gray-400" />
                                    <span className="text-sm font-medium text-gray-200 truncate flex-grow">
                                        {node.data.ui_render?.title || 'Command Process'}
                                    </span>
                                    {/* Validation Status Icon */}
                                    <ValidationShield status={validationStatus[node.id]} errors={validationErrors?.[node.id]} />
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 font-mono truncate max-w-[150px]">
                                        {node.id}
                                    </span>
                                    <span className={`
                                        px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider
                                        ${status === 'pending' ? 'bg-indigo-500/20 text-indigo-300'
                                            : status === 'success' ? 'bg-emerald-500/20 text-emerald-300'
                                                : status === 'failure' ? 'bg-rose-500/20 text-rose-300'
                                                    : 'bg-gray-500/20 text-gray-400'}
                                    `}>
                                        {status === 'pending' ? 'RUNNING' : status === 'failure' ? 'ERROR' : status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
