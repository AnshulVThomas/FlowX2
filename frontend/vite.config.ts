import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const frontendRoot = __dirname
const projectRoot = path.resolve(__dirname, '..')

// Custom plugin: redirect bare module resolution for files in plugins/
// so they resolve from frontend/node_modules instead of their own directory.
function pluginModuleResolver() {
  return {
    name: 'plugin-module-resolver',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      // Only intercept bare imports (no . or / prefix) from plugin files
      if (
        importer &&
        importer.startsWith(path.join(projectRoot, 'plugins')) &&
        !source.startsWith('.') &&
        !source.startsWith('/') &&
        !source.startsWith('@core')
      ) {
        // Redirect resolution to frontend/node_modules
        const resolved = path.join(frontendRoot, 'node_modules', source)
        return this.resolve(source, path.join(frontendRoot, '_virtual_importer.ts'), { skipSelf: true })
      }
      return null
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [pluginModuleResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src')
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', '@xyflow/react', 'lucide-react', 'sonner']
  },
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    }
  }
})
