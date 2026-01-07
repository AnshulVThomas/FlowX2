// Commit for 2025-07-03: Sidebar.tsx edit for historical commit
import React from 'react';

type DragNodeType = 'default' | 'input' | 'output';
type PaletteItem = {
  label: string;
  type: DragNodeType;
};

interface SidebarProps {
  PALETTE: Array<{ group: string; items: PaletteItem[] }>;
  onDragStart: (evt: React.DragEvent, nodeType: DragNodeType) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ PALETTE, onDragStart }) => (
  <aside className="w-64 h-screen border-r border-white/10 bg-[#09090b] flex flex-col overflow-hidden">
    {/* Header - Niri style: strictly aligned, minimalist */}
    <div className="p-6 pb-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/40">
        Palette
      </h2>
    </div>

    {/* Scrollable Area */}
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
      {PALETTE.map((section) => (
        <div key={section.group} className="mb-8">
          <h3 className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-4 px-2">
            {section.group}
          </h3>
          
          <div className="space-y-2">
            {section.items.map((item) => (
              <div
                key={item.label}
                draggable
                onDragStart={(evt) => onDragStart(evt, item.type)}
                className="
                  group relative flex items-center justify-between
                  bg-[#121214] border border-white/5 rounded-sm
                  px-3 py-2.5 cursor-grab active:cursor-grabbing
                  transition-all duration-150 ease-out
                  hover:bg-[#1a1a1d] hover:border-blue-500/50
                "
              >
                <div className="flex items-center gap-3">
                  {/* The 'Active Window' indicator strip */}
                  <div className="w-[2px] h-3 bg-white/10 group-hover:bg-blue-500 transition-colors" />
                  <span className="text-xs font-medium text-white/60 group-hover:text-white transition-colors">
                    {item.label}
                  </span>
                </div>
                
                <span className="text-[9px] font-mono text-white/10 group-hover:text-blue-400/50">
                  {item.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* Status Footer */}
    <div className="p-4 border-t border-white/5 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 px-2">
        <div className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        <span className="text-[10px] font-mono text-white/30 tracking-tighter uppercase">
          Agent_Engine.v1
        </span>
      </div>
    </div>
  </aside>
);

export default Sidebar;