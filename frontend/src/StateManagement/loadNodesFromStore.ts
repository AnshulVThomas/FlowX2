import type { Node } from 'reactflow'
import { useNodeStore } from './nodeStore'

export function useLoadNodesToReactFlow(setNodes: (nodes: Node[]) => void) {
  const { nodes, loadNodes } = useNodeStore()
  // Load from localStorage on mount
  return () => {
    loadNodes()
    setNodes(nodes as Node[])
  }
}
