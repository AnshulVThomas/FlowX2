import { create } from 'zustand'
import type { Node } from 'reactflow'

// Define the shape of our Agent data
export interface AgentData {
  label: string
  apiKey?: string
  tools: string[]
}

interface NodeStoreState {
  nodes: Node[]
  setNodes: (nodes: Node[]) => void
  // Helper to update specific properties inside a node's data
  updateNodeData: (id: string, newData: Partial<AgentData>) => void
  loadNodes: () => void
}

const STORAGE_KEY = 'flowx2-nodes'

export const useNodeStore = create<NodeStoreState>((set, get) => ({
  nodes: [],
  setNodes: (nodes) => {
    set({ nodes })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes))
  },
  updateNodeData: (id, newData) => {
    set((state) => ({
      nodes: state.nodes.map((node) => 
        node.id === id 
          ? { ...node, data: { ...node.data, ...newData } } 
          : node
      )
    }))
    // Save to storage after update
    localStorage.setItem(STORAGE_KEY, JSON.stringify(get().nodes))
  },
  loadNodes: () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        set({ nodes: JSON.parse(raw) })
      } catch {
        set({ nodes: [] })
      }
    }
  },
}))