import { create } from 'zustand'
import type { Node } from 'reactflow'



interface NodeStoreState {
  nodes: Node[]
  setNodes: (nodes: Node[]) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  loadNodes: () => void
  saveNodes: () => void
}

const STORAGE_KEY = 'flowx2-nodes'

export const useNodeStore = create<NodeStoreState>((set, get) => ({
  nodes: [],
  setNodes: (nodes) => {
    const currentNodes = get().nodes;
    if (JSON.stringify(currentNodes) !== JSON.stringify(nodes)) {
      set({ nodes });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
    }
  },
  addNode: (node) => {
    const nodes = [...get().nodes, node]
    set({ nodes })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes))
  },
  removeNode: (id) => {
    const nodes = get().nodes.filter((n) => n.id !== id)
    set({ nodes })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes))
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
  saveNodes: () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(get().nodes))
  },
}))
