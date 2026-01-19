import { Handle, Position } from 'reactflow';

export function ToolCircleNode({ data }: any) {
  return (
    <div style={{ 
      width: 60, height: 60, borderRadius: '50%', background: '#1e293b', 
      border: '2px solid #3b82f6', display: 'flex', alignItems: 'center', 
      justifyContent: 'center', color: '#fff', fontSize: 10, textAlign: 'center' 
    }}>
      {data.label}
      <Handle type="target" position={Position.Top} />
    </div>
  );
}