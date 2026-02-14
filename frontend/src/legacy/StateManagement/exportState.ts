import type { Node, Edge } from 'reactflow'

export function exportFlowState(nodes: Node[], edges: Edge[]) {
  const data = JSON.stringify({ nodes, edges }, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = 'flowx2-canvas-state.json'
  a.click()
  URL.revokeObjectURL(url)
}
