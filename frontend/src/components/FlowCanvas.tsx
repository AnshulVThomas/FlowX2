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
import { AgentNode } from './AgentNode'
import { ApiConfigNode } from './ApiConfigNode'
import { ToolCircleNode } from './ToolCircleNode'
import { exportFlowState } from '../StateManagement/exportState'

import 'reactflow/dist/style.css'

type DragNodeType =
  | 'default'
  | 'agent'
  | 'monitor'
  | 'command'
  | 'tool'
  | 'webhook'
  | 'database'
  | 'apiConfig'
  | 'toolCircle';
type PaletteItem = {
  label: string
  type: DragNodeType
}

const PALETTE: Array<{ group: string; items: PaletteItem[] }> = [
  {
    group: 'Core',
    items: [
      { label: 'Agent', type: 'agent' },
      { label: 'Monitor', type: 'default' },
      { label: 'Command', type: 'default' },
      { label: 'Webhook', type: 'default' },
      { label: 'Database', type: 'default' },
    ],
  },
  {
    group: 'API',
    items: [
      { label: 'API Config Node', type: 'apiConfig' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { label: 'Tool Node', type: 'toolCircle' },
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

  // Zustand Store State & Actions
  const { nodes: storeNodes, setNodes: setStoreNodes, loadNodes, updateNodeData } = useNodeStore()
  const { edges: storeEdges, setEdges: setStoreEdges, loadEdges } = useEdgeStore()

  // Local Selection State
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedEdges, setSelectedEdges] = useState<string[]>([])

  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // 1. On Mount, hydrate Zustand stores from storage
  useEffect(() => {
    loadNodes()
    loadEdges()
  }, [loadNodes, loadEdges])

  // 2. When Zustand store is hydrated, push to React Flow state (only if local state is empty)
  useEffect(() => {
    if (storeNodes.length > 0 && nodes.length === 0) {
      setNodes(storeNodes)
    }
  }, [storeNodes, setNodes])

  useEffect(() => {
    if (storeEdges.length > 0 && edges.length === 0) {
      setEdges(storeEdges)
    }
  }, [storeEdges, setEdges])

  // 3. Sync local changes back to Zustand store (avoids infinite loop by checking content)
  useEffect(() => {
    if (nodes.length > 0) {
      setStoreNodes(nodes as Node[])
    }
  }, [nodes, setStoreNodes])

  useEffect(() => {
    if (edges.length > 0) {
      setStoreEdges(edges)
    }
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


  // Callback to spawn settings nodes (API or Tool)
  const onSpawnSettings = useCallback((agentId: string, type: 'api' | 'tool') => {
    // We use the functional update pattern to get the latest nodes/edges
    setNodes((nds) => {
      const agentNode = nds.find(n => n.id === agentId);
      if (!agentNode) return nds;

      const newId = `${type}-${Date.now()}`;

      // Prevent multiple API nodes if one already exists
      if (type === 'api' && nds.some(n => n.id.startsWith('api-') && n.id.includes(agentId))) {
        return nds;
      }

      const newNode: Node = {
        id: newId,
        type: type === 'api' ? 'apiConfig' : 'toolCircle',
        position: {
          x: agentNode.position.x + (type === 'api' ? -20 : 40),
          y: agentNode.position.y + (type === 'api' ? -150 : 150),
        },
        data: { label: type === 'api' ? 'API Config' : 'New Tool' }
      };

      setEdges((eds) => eds.concat({
        id: `edge-${newId}`,
        source: agentId,
        target: newId,
        sourceHandle: type === 'api' ? 'api-handle' : 'tool-handle',
        animated: true,
      }));

      return nds.concat(newNode);
    });
  }, [setNodes, setEdges]);

  const onDrop = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    const type = evt.dataTransfer.getData('application/reactflow') as DragNodeType;
    const label = evt.dataTransfer.getData('application/reactflow-label') || `${type} node`;

    if (!type || !reactFlowInstanceRef.current) return;

    const position = reactFlowInstanceRef.current.screenToFlowPosition({
      x: evt.clientX,
      y: evt.clientY,
    });

    const newNode: Node = {
      id: getId(),
      type,
      position,
      // ✅ CLEAN: No functions here. Only JSON-serializable data.
      data: type === 'agent'
        ? { label, apiKey: '', tools: [] }
        : { label }
    };

    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]); // reactFlowInstanceRef is a ref, so it doesn't need to be a dependency


  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    // const targetNode = nodes.find((n) => n.id === connection.target);

    // 1. RULE: Only apiConfig nodes can hit the 'api-handle' (Top Diamond)
    if (connection.targetHandle === 'api-handle') {
      return sourceNode?.type === 'apiConfig';
    }

    // 2. RULE: Only toolCircle nodes can hit the 'tool-handle' (Bottom Box)
    if (connection.targetHandle === 'tool-handle') {
      return sourceNode?.type === 'toolCircle';
    }

    // 3. RULE: Standard side handles (usually undefined or 'left'/'right') 
    // should REJECT apiConfig and toolCircle nodes.
    const isSpecialNode = sourceNode?.type === 'apiConfig' || sourceNode?.type === 'toolCircle';

    // If the target handle is NOT one of the special ones, but the source IS a special node, block it.
    if (isSpecialNode && connection.targetHandle !== 'api-handle' && connection.targetHandle !== 'tool-handle') {
      return false;
    }

    // 4. RULE: Prevent standard nodes from plugging into the special handles
    if (!isSpecialNode && (connection.targetHandle === 'api-handle' || connection.targetHandle === 'tool-handle')) {
      return false;
    }

    // Default: Allow standard left-to-right connections between normal nodes
    return true;
  }, [nodes]);


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

  const nodeTypes = useMemo(() => ({
    // ✅ CORRECT: Injecting callbacks as props
    agent: (props: any) => (
      <AgentNode
        {...props}
        updateNodeData={updateNodeData}
        onSpawnSettings={onSpawnSettings}
      />
    ),
    apiConfig: ApiConfigNode,
    toolCircle: ToolCircleNode,
    default: HorizontalNode,
  }), [updateNodeData, onSpawnSettings]);





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
          isValidConnection={isValidConnection}
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