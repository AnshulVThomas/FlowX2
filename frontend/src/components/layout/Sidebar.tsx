import { useWorkflowStore } from "../../store/useWorkflowStore";
import { Play, Sparkles, Key, Puzzle, ChevronLeft, ChevronRight, GitMerge } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { loadPlugins } from "../../registry/pluginLoader";

// Icon mapping for known node types
const iconMap: Record<string, React.ReactNode> = {
    startNode: <Play size={20} />,
    commandNode: <Sparkles size={20} />,
    vaultNode: <Key size={20} />,
    orMergeNode: <GitMerge size={20} />,
};

// Color mapping for categories
const colorMap: Record<string, { bg: string; text: string }> = {
    Core: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    System: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
    'Flow Control': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    Configuration: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
};

// Category display order
const CATEGORY_ORDER = ['Core', 'System', 'Flow Control', 'Configuration'];

// Nodes that can only exist once on the canvas
const { singletonTypes: SINGLETON_TYPES } = loadPlugins();

export const Sidebar = memo(() => {
    const nodes = useWorkflowStore((state) => state.nodes);
    const [collapsed, setCollapsed] = useState(false);

    const toolsMenu = useMemo(() => loadPlugins().toolsMenu, []);

    // Group plugins by category
    const grouped = useMemo(() => {
        const groups: Record<string, typeof toolsMenu> = {};
        for (const plugin of toolsMenu) {
            const cat = plugin.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(plugin);
        }
        return groups;
    }, [toolsMenu]);

    const sortedCategories = useMemo(() => {
        const cats = CATEGORY_ORDER.filter(c => grouped[c]?.length);
        for (const cat of Object.keys(grouped)) {
            if (!cats.includes(cat)) cats.push(cat);
        }
        return cats;
    }, [grouped]);

    const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
        event.dataTransfer.setData('application/reactflow/type', nodeType);
        event.dataTransfer.setData('application/reactflow/label', label);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside
            className={`
                bg-black/40 backdrop-blur-md border-r border-white/10 p-3 flex flex-col gap-3 z-40 h-full select-none
                transition-all duration-300 ease-in-out overflow-hidden
                ${collapsed ? 'w-16' : 'w-64'}
            `}
        >
            {/* Header with toggle */}
            <div className="flex items-center justify-between min-h-[28px]">
                {!collapsed && (
                    <span className="text-sm font-semibold text-gray-400">Nodes</span>
                )}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className={`
                        p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors
                        ${collapsed ? 'mx-auto' : 'ml-auto'}
                    `}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {/* Categorized node items */}
            <div className="flex flex-col gap-4 overflow-y-auto">
                {sortedCategories.map(category => (
                    <div key={category}>
                        {/* Category header — hidden when collapsed */}
                        {!collapsed && (
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                                    {category}
                                </span>
                                <div className="flex-1 border-t border-white/5" />
                            </div>
                        )}
                        <div className={`flex flex-col ${collapsed ? 'gap-2' : 'gap-1.5'}`}>
                            {grouped[category].map(plugin => {
                                const isSingleton = SINGLETON_TYPES.has(plugin.id);
                                const alreadyExists = isSingleton && nodes.some(n => n.type === plugin.id);
                                const disabled = alreadyExists;

                                const colors = colorMap[plugin.category] || { bg: 'bg-purple-500/20', text: 'text-purple-400' };
                                const icon = iconMap[plugin.id] || <Puzzle size={20} />;

                                return (
                                    <div
                                        key={plugin.id}
                                        className={`
                                            flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 transition-all
                                            ${collapsed ? 'p-2.5 justify-center' : 'p-3'}
                                            ${disabled
                                                ? 'opacity-50 cursor-not-allowed grayscale'
                                                : 'cursor-grab hover:bg-white/10 hover:border-white/20 active:cursor-grabbing'
                                            }
                                        `}
                                        onDragStart={(event) => !disabled && onDragStart(event, plugin.id, plugin.name)}
                                        draggable={!disabled}
                                        title={collapsed ? plugin.name : undefined}
                                    >
                                        <div className={`p-2 rounded ${colors.bg} ${colors.text} flex-shrink-0`}>
                                            {icon}
                                        </div>
                                        {!collapsed && (
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium text-gray-200 truncate">{plugin.name}</span>
                                                <span className="text-xs text-gray-500 truncate">{plugin.description}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
});