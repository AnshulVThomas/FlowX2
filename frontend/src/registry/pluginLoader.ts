import type { ComponentType } from 'react';

// Eagerly import all manifests and frontend components
const manifestModules = import.meta.glob('../../../plugins/*/manifest.json', { eager: true });
const frontendModules = import.meta.glob('../../../plugins/*/frontend/index.tsx', { eager: true });

export interface PluginManifest {
    id: string;
    name: string;
    category: string;
    color: string;
    description: string;
    singleton?: boolean;
    executable?: boolean; // defaults true; set false for config-only nodes
    backend_class: string;
    frontend_component: string;
}

export const loadPlugins = () => {
    const nodeTypes: Record<string, ComponentType<any>> = {};
    const toolsMenu: PluginManifest[] = [];
    const singletonTypes = new Set<string>();

    console.log("🔌 Loading plugins...", Object.keys(manifestModules));

    // Iterate over discovered manifests
    for (const manifestPath in manifestModules) {
        try {
            const manifestModule = manifestModules[manifestPath] as any;
            const manifest = manifestModule.default as PluginManifest;

            // Extract plugin folder name (e.g., "CommandNode")
            // Path format: ../../../plugins/CommandNode/manifest.json
            const parts = manifestPath.split('/');
            const pluginFolderName = parts[parts.length - 2];

            // Validation
            if (!manifest.id || !manifest.name || !manifest.backend_class || !manifest.frontend_component) {
                console.warn(`⚠️ skipping invalid plugin manifest in ${pluginFolderName}: Missing required fields`, manifest);
                continue;
            }

            const frontendPath = `../../../plugins/${pluginFolderName}/frontend/index.tsx`;
            const frontendModule = frontendModules[frontendPath] as any;

            if (frontendModule && frontendModule.default) {
                // 1. Register for React Flow
                // Use manifest.id as the node type
                nodeTypes[manifest.id] = frontendModule.default;

                // 2. Register for the UI Sidebar
                toolsMenu.push(manifest);

                // 3. Track singleton types
                if (manifest.singleton) {
                    singletonTypes.add(manifest.id);
                }

                console.log(`✅ Plugin Loaded: ${manifest.name} (${manifest.id})`);
            } else {
                console.warn(`⚠️ Frontend component missing for plugin: ${pluginFolderName} at ${frontendPath}`);
            }
        } catch (e) {
            console.error(`❌ Failed to load plugin from ${manifestPath}`, e);
        }
    }

    return { nodeTypes, toolsMenu, singletonTypes };
};
