// Commit for 2025-07-04: FlowNode.tsx edit for historical commit
import type { CSSProperties } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

type FlowNodeData = { label: string }

const wrapperStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  boxShadow: 'none',
  padding: 0,
}

function baseStyle(selected: boolean): CSSProperties {
  return {
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${selected ? 'rgba(59,130,246,0.9)' : 'rgba(148,163,184,0.35)'}`,
    background: 'rgba(15, 23, 42, 0.75)',
    color: 'rgba(226,232,240,0.95)',
    minWidth: 140,
    boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.25)' : undefined,
  }
}

export function HorizontalNode({ data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div style={wrapperStyle}>
      <div style={baseStyle(!!selected)}>
        <Handle type="target" position={Position.Left} />
        <div style={{ fontSize: 12, fontWeight: 600 }}>{data?.label ?? 'Node'}</div>
        <Handle type="source" position={Position.Right} />
      </div>
    </div>
  )
}

export function HorizontalInputNode({ data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div style={wrapperStyle}>
      <div style={baseStyle(!!selected)}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{data?.label ?? 'Input'}</div>
        <Handle type="source" position={Position.Right} />
      </div>
    </div>
  )
}

export function HorizontalOutputNode({ data, selected }: NodeProps<FlowNodeData>) {
  return (
    <div style={wrapperStyle}>
      <div style={baseStyle(!!selected)}>
        <Handle type="target" position={Position.Left} />
        <div style={{ fontSize: 12, fontWeight: 600 }}>{data?.label ?? 'Output'}</div>
      </div>
    </div>
  )
}

