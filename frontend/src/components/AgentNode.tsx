import { Handle, Position } from 'reactflow';

import './styles/AgentNode.css'; 
interface AgentNodeProps {
  id: string;
  data: { label: string };
  // Ensure this prop exists in your interface
  onSpawnSettings: (id: string, type: 'api' | 'tool') => void;
}

export function AgentNode({ id, data, onSpawnSettings }: AgentNodeProps) {
  return (
    <div className="agent-custom-node">
      {/* 1. Standard Flow Handles (Left/Right Circles) */}
      <Handle type="target" position={Position.Left} className="standard-handle" />
      <Handle type="source" position={Position.Right} className="standard-handle" />

      {/* 2. Top Trigger (Diamond - API) */}
      <div 
        className="trigger-wrapper top" 
        onClick={(e) => {
          e.stopPropagation();
          onSpawnSettings(id, 'api');
        }}
        title="Configure API"
      >
        {/* We use specific classes for the shape */}
        <div className="trigger-shape diamond"></div>
        {/* Hidden functional handle */}
        <Handle type="source" position={Position.Top} id="api-handle" style={{ opacity: 0 }} />
      </div>

      <div className="agent-node-content">
       
        <div style={{ fontWeight: 'bold' }}>{data.label}</div>
      </div>

      {/* 3. Bottom Trigger (Box - Tools) */}
      <div 
        className="trigger-wrapper bottom" 
        onClick={(e) => {
          e.stopPropagation();
          onSpawnSettings(id, 'tool');
        }}
        title="Add Tool"
      >
        {/* Changed class to 'box' */}
        <div className="trigger-shape box"></div>
        {/* Hidden functional handle */}
        <Handle type="source" position={Position.Bottom} id="tool-handle" style={{ opacity: 0 }} />
      </div>
    </div>
  );
}