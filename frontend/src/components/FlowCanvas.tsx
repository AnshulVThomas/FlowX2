// updated file
import { useCallback, useMemo, useRef } from 'react'
import ReactFlow, { addEdge, Background, Controls, MiniMap, useEdgesState, useNodesState } from 'reactflow'
import type { Connection, Edge, Node, OnConnect, ReactFlowInstance } from 'reactflow'

import 'reactflow/dist/style.css'
import { HorizontalInputNode, HorizontalNode, HorizontalOutputNode } from './FlowNode'

type DragNodeType = 'default' | 'input' | 'output'
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
    ],
  },
  {
    group: 'I/O',
    items: [
      { label: 'Input', type: 'input' },
      { label: 'Output', type: 'output' },
      { label: 'Webhook', type: 'default' },
      { label: 'Database', type: 'default' },
    ],
  },
]

const initialNodes: Node[] = []

const initialEdges: Edge[] = []

let nextId = 1
function getId() {
  return String(nextId++)
}

export default function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  )

  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 1 }), [])
  const nodeTypes = useMemo(
    () => ({
      default: HorizontalNode,
      input: HorizontalInputNode,
      output: HorizontalOutputNode,
    }),
    [],
  )

  const onDragStart = useCallback((evt: React.DragEvent, nodeType: DragNodeType) => {
    evt.dataTransfer.setData('application/reactflow', nodeType)
    // Optional label payload for our palette items
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
      if (!type) return
      const label = evt.dataTransfer.getData('application/reactflow-label') || `${type} node`

      const wrapper = reactFlowWrapper.current
      if (!wrapper) return
      const instance = reactFlowInstanceRef.current
      if (!instance) return

      // Convert screen coordinates into React Flow coordinates (accounts for pan/zoom).
      const position = instance.screenToFlowPosition({ x: evt.clientX, y: evt.clientY })

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: { label },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [setNodes],
  )

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
                  role="button"
                  tabIndex={0}
                  title={`Type: ${item.type}`}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        ))}
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
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance
          }}
          defaultViewport={defaultViewport}
          nodeTypes={nodeTypes}
        >
          <MiniMap />
          <Controls />
          <Background gap={16} />
        </ReactFlow>
      </div>
    </div>
  )
}

