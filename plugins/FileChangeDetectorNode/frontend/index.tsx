import React, { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';
import { FileIcon, Clock, CheckSquare } from 'lucide-react';

type FileChangeDetectorNode = Node<{
    watch_path?: string;
    event_mask?: string[];
    timeout?: number | string;
    recursive?: boolean;
    onChange?: (field: string, value: any) => void;
}>;

export default memo(({ id, data, isConnectable, selected }: NodeProps<FileChangeDetectorNode>) => {
    // Default values if not set
    const watchPath = data.watch_path || '';
    const eventMask = data.event_mask || ['created', 'modified', 'deleted'];
    const timeout = data.timeout || 0;
    const recursive = data.recursive || false;

    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

    // Handle input changes
    const onChange = (field: string, value: any) => {
        updateNodeData(id, { [field]: value });
    };

    const handleCheckboxChange = (type: string) => {
        const newMask = eventMask.includes(type)
            ? eventMask.filter(e => e !== type)
            : [...eventMask, type];
        onChange('event_mask', newMask);
    };

    return (
        <div className={`
            flex flex-col rounded-lg bg-white border-2 transition-all duration-300 min-w-[300px] overflow-hidden
            ${selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-200 shadow-sm'}
        `}>
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125"
            />
            
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex flex-row items-center gap-2">
                    <div className="p-1.5 bg-amber-50 rounded-md">
                        <FileIcon size={16} className="text-amber-500" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Wait For File Change</span>
                        <span className="text-[10px] text-slate-400">File System</span>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
                
                {/* Watch Path */}
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex justify-between">
                        <span>File or Directory to Watch</span>
                        <span className="text-[10px] text-amber-500 font-normal">Supports {'{{vars}}'}</span>
                    </label>
                    <input
                        type="text"
                        value={watchPath}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange('watch_path', e.target.value)}
                        placeholder="/tmp/flowx or {{inputs.start.path}}"
                        className="w-full bg-white border border-gray-200 text-slate-700 text-sm rounded-md px-3 py-2 
                                 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 
                                 transition-colors font-mono"
                    />
                </div>

                {/* Event Types */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <CheckSquare size={12} className="text-slate-400" />
                        Events to Track
                    </label>
                    <div className="flex gap-2 text-xs">
                        {['created', 'modified', 'deleted'].map(type => (
                            <label key={type} className="flex flex-1 items-center gap-1.5 cursor-pointer bg-gray-50 border border-gray-200 rounded p-1.5 hover:border-gray-300 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={eventMask.includes(type)}
                                    onChange={() => handleCheckboxChange(type)}
                                    className="rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 bg-white"
                                />
                                <span className={eventMask.includes(type) ? 'text-slate-700 font-medium' : 'text-slate-500'}>
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Recursive & Timeout Group */}
                <div className="flex gap-3">
                    {/* Recursive Toggle */}
                    <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-bold text-slate-700">Subdirectories</label>
                        <button
                            onClick={() => onChange('recursive', !recursive)}
                            className={`w-full py-1.5 px-3 text-xs rounded-md border transition-colors flex items-center justify-center gap-2
                                ${recursive 
                                    ? 'bg-amber-50 border-amber-200 text-amber-600 font-medium' 
                                    : 'bg-white border-gray-200 text-slate-500 hover:border-gray-300'}`}
                        >
                            {recursive ? 'Yes (Recursive)' : 'No (Flat)'}
                        </button>
                    </div>

                    {/* Timeout */}
                    <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Clock size={12} className="text-slate-400" /> Timeout (sec)
                        </label>
                        <input
                            type="number"
                            value={timeout || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange('timeout', e.target.value)}
                            placeholder="0 = Infinite"
                            className="w-full bg-white border border-gray-200 text-slate-700 text-sm rounded-md px-3 py-1.5 
                                     focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 
                                     transition-colors"
                        />
                    </div>
                </div>

            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                isConnectable={isConnectable}
                className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125"
            />
        </div>
    );
});
