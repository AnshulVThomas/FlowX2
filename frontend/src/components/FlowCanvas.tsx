import { useCallback, useMemo, useRef, useEffect, useState } from 'react'
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  MiniMap, 
  useEdgesState, 
  useNodesState 
} from 'reactflow'
// Type-only imports to satisfy verbatimModuleSyntax
import type { 
  Connection, 
  Edge, 
  Node, 
  OnConnect, 
  ReactFlowInstance 
} from 'reactflow'

import { useNodeStore } from '../StateManagement/nodeStore'
import { useEdgeStore } from '../StateManagement/edgeStore'
import { HorizontalNode } from './FlowNode'
import { exportFlowState } from '../StateManagement/exportState'

import 'reactflow/dist/style.css'

type DragNodeType = 'default'
type PaletteItem = {
  label: string
  type: DragNodeType
}

const PALETTE: Array<{ group: string; items: PaletteItem[] }> = [
  {
    group: 'Core',
    items: [
      { label: 'Agent', type: 'default' },
      { label: 'Monitor', type: 'default' },
      { label: 'Command', type: 'default' },
      { label: 'Tool', type: 'default' },
      { label: 'Webhook', type: 'default' },
      { label: 'Database', type: 'default' },
    ],
  },
]

// ID generation should ideally be based on existing nodes length to avoid collisions on refresh
let nextId = Date.now()
function getId() {
  return String(nextId++)
}

export default function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)

  // Local Selection State
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedEdges, setSelectedEdges] = useState<string[]>([])

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Zustand Store Actions
  const { setNodes: setStoreNodes, loadNodes } = useNodeStore()
  const { setEdges: setStoreEdges, loadEdges } = useEdgeStore()

  // 1. INITIAL LOAD: Load data from stores on mount
  useEffect(() => {
    loadNodes()
    loadEdges()
    
    // We pull from localStorage here to hydrate the local ReactFlow state
    const savedNodes = localStorage.getItem('flowx2-nodes')
    const savedEdges = localStorage.getItem('flowx2-edges')
    
    if (savedNodes) {
      try { setNodes(JSON.parse(savedNodes)) } catch (e) { console.error(e) }
    }
    if (savedEdges) {
      try { setEdges(JSON.parse(savedEdges)) } catch (e) { console.error(e) }
    }
  }, [loadNodes, loadEdges, setNodes, setEdges])

  // 2. AUTO-SYNC: Sync store whenever local nodes/edges change (captures movement, connects, and deletes)
  useEffect(() => {
    // We cast to Node[] to resolve the 'string | undefined' type mismatch
    setStoreNodes(nodes as Node[])
  }, [nodes, setStoreNodes])

  useEffect(() => {
    setStoreEdges(edges)
  }, [edges, setStoreEdges])

  // Handlers
  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const onSelectionChange = useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodes(params.nodes.map((n) => n.id))
    setSelectedEdges(params.edges.map((e) => e.id))
  }, [])

  const onDragStart = useCallback((evt: React.DragEvent, nodeType: DragNodeType) => {
    evt.dataTransfer.setData('application/reactflow', nodeType)
    const label = (evt.currentTarget as HTMLElement).dataset.rfLabel
    if (label) evt.dataTransfer.setData('application/reactflow-label', label)
    evt.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (evt: React.DragEvent) => {
      evt.preventDefault()
      const type = evt.dataTransfer.getData('application/reactflow') as DragNodeType
      const label = evt.dataTransfer.getData('application/reactflow-label') || `${type} node`

      if (!type || !reactFlowInstanceRef.current) return

      const position = reactFlowInstanceRef.current.screenToFlowPosition({
        x: evt.clientX,
        y: evt.clientY,
      })

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: { label },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [setNodes]
  )

  // Keyboard Shortcuts (Delete/Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodes.length > 0) {
          setNodes((nds) => nds.filter((n) => !selectedNodes.includes(n.id)))
        }
        if (selectedEdges.length > 0) {
          setEdges((eds) => eds.filter((e) => !selectedEdges.includes(e.id)))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodes, selectedEdges, setNodes, setEdges])

  const nodeTypes = useMemo(() => ({ default: HorizontalNode }), [])
  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 1 }), [])

  return (
    <div className="flow-page">
      <aside className="sidebar">
        <div className="sidebar-title">Palette</div>
        <div className="sidebar-help">Drag items onto the canvas</div>
        {PALETTE.map((section) => (
          <div className="sidebar-group" key={section.group}>
            <div className="sidebar-group-title">{section.group}</div>
            <div className="sidebar-group-items">
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className="dnd-node"
                  draggable
                  data-rf-label={item.label}
                  onDragStart={(evt) => onDragStart(evt, item.type)}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button
          style={{ marginTop: 16, width: '100%', padding: 8, background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          onClick={() => exportFlowState(nodes, edges)}
        >
          Export as JSON
        </button>
      </aside>

      <div className="canvas" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={(instance) => { reactFlowInstanceRef.current = instance }}
          nodeTypes={nodeTypes}
          onSelectionChange={onSelectionChange}
          defaultViewport={defaultViewport}
        >
          <MiniMap />
          <Controls />
          <Background gap={16} />
        </ReactFlow>
      </div>
    </div>
  )
}