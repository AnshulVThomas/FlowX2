# FlowX Plugin Design System

This document outlines the standard styling for Plugin Nodes to ensure visual consistency across the canvas.

## 1. Global Semantic States (Execution)
When a node is in an execution state, it must transition from its "Idle" gray border to a high-contrast semantic color.

| State | Tailwind Color | Hex Code | Visual Effect |
| :--- | :--- | :--- | :--- |
| **Running** | `yellow-500` | `#eab308` | [Spinning Conic Gradient](#spinning-animations) + [Glow](#glow-layers) |
| **Success** | `green-500` | `#22c55e` | Solid border + green shadow |
| **Error** | `red-500` | `#ef4444` | Solid border + red shadow |
| **Selection** | `blue-500` | `#3b82f6` | Solid border (Lowest priority) |

---

## 2. Standard Tool Node
Capability tools (Stop, Shell, Vault) use a simple white card design.

- **Idle**: `bg-white rounded-xl border-2 border-gray-100 shadow-sm`
- **Icon**: `bg-X-50 text-X-500` inside a `p-1.5 rounded-md` wrapper.
- **Selection**: `border-blue-500 shadow-xl shadow-blue-500/20`

---

## 3. High-Power Nodes (Agent / Command)
The "Brain" and "Terminal" nodes use premium, high-density designs with complex animations.

### Header / Icon
- **Running Style**: `bg-yellow-50 text-yellow-600`
- **Icon**: `Bot` or `Sparkles`, size 20 (Agent) or 14 (Header).

### Spinning Animations
When `isRunning` is true, high-power nodes use a spinning gradient border:
- **Container**: `absolute -inset-[5px] rounded-2xl overflow-hidden`
- **Gradient**: `conic-gradient(from_0deg_at_50%_50%,#fef08a_0%,#eab308_50%,#ca8a04_100%)`
- **Speed**: `animate-[spin_3s_linear_infinite]`

### Glow Layers
Underlay glows used to create atmosphere:
- **Inset**: `-inset-[4px]`
- **Color**: `bg-yellow-400/30`
- **Effect**: `blur-lg animate-pulse`

---

## 4. Hierarchy of Borders
If multiple states are true simultaneously, follow this priority:
1. **Running** (Highest Priority - MUST show animation)
2. **Error**
3. **Success**
4. **Selected** (Lowest Priority - Gray/Blue borders only if idle)

---

## 5. Shadow Intensity (Glow)
Execution states use custom arbitrary shadow values:
- `shadow-[0_0_40px_-10px_rgba(234,179,8,0.5)]` (Yellow Running)
- `shadow-[0_0_30px_-10px_rgba(239,68,68,0.4)]` (Red Error)
- `shadow-[0_0_30px_-10px_rgba(34,197,94,0.4)]` (Green Success)
