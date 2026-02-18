# FlowX Plugin Design System

This document outlines the standard styling for Plugin Nodes to ensure consistency across the canvas.

## Standard Tool Node

All capability tools (Shell, Filesystem, Stop, Restart) must follow this "White Theme" card design.

### Container
- **Base**: `bg-white rounded-lg border-2 border-gray-200 shadow-sm`
- **Selection**: `border-blue-500 shadow-lg shadow-blue-500/20` (ALWAYS BLUE)
- **Transition**: `transition-all duration-300`

### Header / Icon
- **Wrapper**: `p-1.5 rounded-md`
- **Color**: Specific to the tool (e.g., `bg-blue-50` for Shell, `bg-red-50` for Stop).
- **Icon**: Lucide React Icon, size 16, matching text color (e.g., `text-blue-500`).

### Typography
- **Title**: `text-xs font-bold text-slate-700`
- **Subtitle**: `text-[10px] text-slate-400`

### Code Example

```tsx
<div className={`
    flex flex-col items-center gap-2 px-3 py-2 rounded-lg 
    bg-white border-2 transition-all duration-300 
    ${selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-200 shadow-sm'}
`}>
    {/* Icon & Label Group */}
    <div className="flex items-center gap-2">
        <div className="p-1.5 bg-blue-50 rounded-md">
            <Icon size={16} className="text-blue-500" />
        </div>
        <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700">Tool Name</span>
            <span className="text-[10px] text-slate-400">Category</span>
        </div>
    </div>

    <Handle ... />
</div>
```

---

## Agent Node (ReAct)

Agent nodes use a darker, high-contrast theme to stand out as the "Brain".

### Container
- **Base**: `bg-slate-900 rounded-xl border-2 border-slate-700`
- **Selection**: `border-emerald-500 shadow-xl shadow-emerald-500/20`
