import { useCallback, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { AgentData } from '../StateManagement/nodeStore';

interface AgentNodeProps {
  data: AgentData;
  id: string;
  updateNodeData?: (id: string, data: Partial<AgentData>) => void;
}

export function AgentNode({ data, id, updateNodeData }: AgentNodeProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  const onApiKeyChange = useCallback((evt: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData?.(id, { apiKey: evt.target.value });
  }, [id, updateNodeData]);

  const onLabelChange = useCallback((evt: React.ChangeEvent<HTMLInputElement>) => {
    updateNodeData?.(id, { label: evt.target.value });
  }, [id, updateNodeData]);

  const availableTools = ['Search Tool', 'Calculator', 'Database Reader'];

  const onAddTool = useCallback((evt: React.ChangeEvent<HTMLSelectElement>) => {
    const tool = evt.target.value;
    // Safety check for tools array
    const currentTools = data.tools || [];
    if (tool && !currentTools.includes(tool)) {
      updateNodeData?.(id, { tools: [...currentTools, tool] });
    }
  }, [id, updateNodeData, data.tools]);

  const onRemoveTool = useCallback((tool: string) => {
    const currentTools = data.tools || [];
    updateNodeData?.(id, { tools: currentTools.filter(t => t !== tool) });
  }, [id, updateNodeData, data.tools]);

  return (
    <div className="agent-node-custom" style={{ minWidth: 200, background: '#101828', borderRadius: 12, padding: 12, border: '1px solid #3b82f6', color: '#e2e8f0' }}>
      <Handle type="target" position={Position.Left} />
      
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        Agent: 
        <input 
          className="nodrag" 
          type="text" 
          value={data.label || ''} 
          onChange={onLabelChange} 
          style={{ background: 'transparent', color: '#e2e8f0', border: 'none', borderBottom: '1px solid #3b82f6', marginLeft: 5, width: '100px' }} 
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, color: '#a0aec0' }}>API KEY</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={data.apiKey || ''}
            onChange={onApiKeyChange}
            className="nodrag"
            style={{ background: '#1a2233', color: '#fff', border: '1px solid #3b82f6', borderRadius: 4, flex: 1, padding: '2px 4px' }}
          />
          <button onClick={() => setShowApiKey(!showApiKey)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            {showApiKey ? '🙈' : '👁️'}
          </button>
        </div>

        <label style={{ fontSize: 11, color: '#a0aec0' }}>TOOLS</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(data.tools || []).map(tool => (
            <span key={tool} style={{ background: '#3b82f6', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
              {tool} <span onClick={() => onRemoveTool(tool)} style={{ cursor: 'pointer', marginLeft: 4 }}>×</span>
            </span>
          ))}
        </div>
        
        <select className="nodrag" onChange={onAddTool} value="" style={{ background: '#1a2233', color: '#fff', border: '1px solid #3b82f6', borderRadius: 4 }}>
          <option value="">+ Add Tool</option>
          {availableTools.filter(t => !(data.tools || []).includes(t)).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}