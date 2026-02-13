import { Handle, Position } from 'reactflow';

export function ApiConfigNode({ data }: any) {
  return (
    <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, border: '1px solid #94a3b8', color: '#fff', width: 180 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>API CONFIGURATION</div>
      <select className="nodrag" style={{ width: '100%', marginBottom: 8, background: '#0f172a', color: '#fff' }}>
        <option>OpenAI</option>
        <option>GEMINI</option>
        <option>CLAUDE</option>
      </select>
      <input className="nodrag" type="password" placeholder="API Key" style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#fff' }} />
      <Handle type="target" position={Position.Bottom} />
    </div>
  );
}