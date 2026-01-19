import { create } from 'zustand'
import type { Edge } from 'reactflow'

interface EdgeStoreState {
  edges: Edge[]
  setEdges: (edges: Edge[]) => void
  addEdge: (edge: Edge) => void
  removeEdge: (id: string) => void
  loadEdges: () => void
  saveEdges: () => void
}

const STORAGE_KEY = 'flowx2-edges'

export const useEdgeStore = create<EdgeStoreState>((set, get) => ({
  edges: [],
  setEdges: (edges) => {
    set({ edges })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edges))
  },
  addEdge: (edge) => {
    const edges = [...get().edges, edge]
    set({ edges })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edges))
  },
  removeEdge: (id) => {
    const edges = get().edges.filter((e) => e.id !== id)
    set({ edges })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edges))
  },
  loadEdges: () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        set({ edges: JSON.parse(raw) })
      } catch {
        set({ edges: [] })
      }
    }
  },
  saveEdges: () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(get().edges))
  },
}))
