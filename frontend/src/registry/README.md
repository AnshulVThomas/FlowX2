# Frontend Plugin Registry

The Frontend Registry is the automated discovery system that powers the dynamic UI of FlowX2. It is responsible for scanning the `plugins/` directory at compile time, registering custom node components for **React Flow**, and generating the interactive sidebar menu.

## 🚀 Key Features

-   **Zero-Config Discovery**: Uses Vite's `import.meta.glob` to automatically find and import every plugin in the project.
-   **Eager Loading**: All manifests and components are eagerly bundled to ensure the UI feels instantaneous with no loading flickers during graph interactions.
-   **React Flow Integration**: Automatically maps plugin IDs to their respective React components, enabling React Flow to render custom nodes.
-   **Dynamic Sidebar**: Generates the "Add Node" menu based on category, color, and description metadata found in each plugin's `manifest.json`.
-   **Singleton Enforcement**: Tracks nodes marked as `singleton: true` to prevent users from adding multiple instances of unique components (like the `StartNode`).

## 🏗 Technical Implementation

### 1. The Global Discovery Scan
The registry leverages Vite's static analysis to find all plugins during the build process.
```typescript
// pluginLoader.ts:L4-5
const manifestModules = import.meta.glob('../../../plugins/*/manifest.json', { eager: true });
const frontendModules = import.meta.glob('../../../plugins/*/frontend/index.tsx', { eager: true });
```

### 2. The `loadPlugins` Orchestrator
The `loadPlugins()` function processes the discovered modules and returns a structured registry.
-   **Extraction**: It parses the directory structure to link a `manifest.json` with its corresponding `frontend/index.tsx`.
-   **Validation**: Every manifest is checked for required fields (`id`, `name`, `backend_class`, `frontend_component`) before being registered.
-   **Registration**:
    -   `nodeTypes`: A map of `Record<string, ComponentType>` used directly by the React Flow `<ReactFlow />` component.
    -   `toolsMenu`: A flat list of manifests filtered and categorized for the UI sidebar.
    -   `singletonTypes`: A Set used by the `useWorkflowStore` to manage node creation limits.

### 3. Usage in Canvas
The registry is consumed by core UI components like `Canvas.tsx` to initialize the workflow environment.
```typescript
// Canvas.tsx (Abridged)
const { nodeTypes: pluginNodeTypes } = loadPlugins();
const nodeTypes = useMemo(() => ({
    ...pluginNodeTypes,
    // ... internal system nodes ...
}), [pluginNodeTypes]);
```

## 📝 The Plugin Manifest (`manifest.json`)

To be discovered by the registry, every plugin must include a manifest with the following structure:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier (e.g., `commandNode`). |
| `name` | `string` | Display name for the sidebar. |
| `category` | `string` | Sidebar grouping (e.g., `Intelligence`). |
| `color` | `string` | Visual theme color for the node. |
| `singleton` | `boolean` | If true, only one instance can exist in a graph. |
| `executable`| `boolean` | If false, the node is treated as static config (e.g., `VaultNode`). |

## 💡 Best Practices

1.  **Unique IDs**: Ensure your plugin ID matches the `backend_class` identifier to maintain parity between the frontend and the execution engine.
2.  **Explicit Exports**: Your `frontend/index.tsx` must use a **default export** for the React component so the loader can correctly bind it to the React Flow registry.
3.  **Category Consistency**: Use existing categories (`Logic`, `Filesystem`, `Intelligence`, `Control`) to keep the sidebar organized.
