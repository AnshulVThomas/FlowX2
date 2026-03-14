import React, { memo, useEffect } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@core/store/useWorkflowStore';
import { FileIcon, Clock, CheckSquare, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { ValidationShield } from '@core/components/ValidationShield';

type FileChangeDetectorNode = Node<{
    watch_path?: string;
    event_mask?: string[];
    timeout?: number | string;
    recursive?: boolean;
    execution_status?: string;
    onChange?: (field: string, value: any) => void;
}>;

export default memo(({ id, data, isConnectable, selected }: NodeProps<FileChangeDetectorNode>) => {
    const watchPath = data.watch_path || '';
    const eventMask = data.event_mask || ['created', 'modified', 'deleted'];
    const timeout = data.timeout || 0;
    const recursive = data.recursive || false;
    const executionStatus = (data as any).execution_status;

    const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
    const validationStatus = useWorkflowStore((state) => state.validationStatus[id]);
    const validationErrors = useWorkflowStore((state) => state.validationErrors?.[id]);

    // Push default values to store on first mount so global validation sees them
    useEffect(() => {
        if (!data.event_mask) {
            updateNodeData(id, { event_mask: ['created', 'modified', 'deleted'] });
        }
    }, [id, data.event_mask, updateNodeData]);

    const onChange = (field: string, value: any) => {
        updateNodeData(id, { [field]: value });
    };

    const handleCheckboxChange = (type: string) => {
        const newMask = eventMask.includes(type)
            ? eventMask.filter(e => e !== type)
            : [...eventMask, type];
        onChange('event_mask', newMask);
    };

    // --- Border & Shadow State Machine (matches CommandNode pattern) ---
    let borderClass = 'border-gray-200 shadow-sm';
    if (selected) {
        borderClass = 'border-blue-500 shadow-lg shadow-blue-500/20';
    } else if (executionStatus === 'running') {
        borderClass = 'border-amber-400 shadow-lg shadow-amber-400/25';
    } else if (validationStatus === 'VALIDATION_FAILED') {
        borderClass = 'border-amber-500 shadow-lg shadow-amber-500/30 animate-pulse';
    } else if (executionStatus === 'completed') {
        borderClass = 'border-emerald-500 shadow-lg shadow-emerald-500/20';
    } else if (executionStatus === 'failed') {
        borderClass = 'border-rose-500 shadow-lg shadow-rose-500/20';
    }

    // --- Status badge in header ---
    const statusBadge = () => {
        if (executionStatus === 'running') {
            return (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    <Eye size={10} className="animate-pulse" />
                    Watching
                </div>
            );
        }
        if (executionStatus === 'completed') {
            return (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <CheckCircle2 size={10} />
                    Triggered
                </div>
            );
        }
        if (executionStatus === 'failed') {
            return (
                <div className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                    <XCircle size={10} />
                    Timeout
                </div>
            );
        }
        return null;
    };

    // Disable form inputs while node is running
    const isLocked = executionStatus === 'running';

    return (
        <div className="relative group transition-all duration-300">
            <ValidationShield 
                status={validationStatus} 
                errors={validationErrors} 
                className="absolute -top-3 -right-3 z-50 transition-all duration-300 transform hover:scale-110" 
            />
            
            <div className={`
                flex flex-col rounded-lg bg-white border-2 transition-all duration-300 min-w-[300px] overflow-hidden
                ${borderClass}
                ${executionStatus === 'running' ? 'ring-2 ring-amber-400/30 ring-offset-1 animate-pulse-slow' : ''}
            `}>
                {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className="!w-3 !h-3 !bg-stone-400 !border-2 !border-white transition-all hover:scale-125"
            />
            
            {/* Header */}
            <div className={`px-4 py-3 border-b flex items-center justify-between transition-colors duration-300
                ${executionStatus === 'running' ? 'border-amber-100 bg-amber-50/50' : 'border-gray-100'}
            `}>
                <div className="flex flex-row items-center gap-2">
                    <div className={`p-1.5 rounded-md transition-colors duration-300
                        ${executionStatus === 'running' ? 'bg-amber-100' : 'bg-amber-50'}
                    `}>
                        <FileIcon size={16} className={`transition-colors duration-300
                            ${executionStatus === 'running' ? 'text-amber-600' : 'text-amber-500'}
                        `} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Wait For File Change</span>
                        <span className="text-[10px] text-slate-400">File System</span>
                    </div>
                </div>
                {statusBadge()}
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
                        disabled={isLocked}
                        className={`w-full border text-slate-700 text-sm rounded-md px-3 py-2 
                                 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 
                                 transition-colors font-mono
                                 ${isLocked ? 'bg-gray-50 text-slate-400 cursor-not-allowed' : 'bg-white border-gray-200'}`}
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
                            <label key={type} className={`flex flex-1 items-center gap-1.5 cursor-pointer border rounded p-1.5 transition-colors
                                ${isLocked ? 'opacity-60 cursor-not-allowed bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={eventMask.includes(type)}
                                    onChange={() => handleCheckboxChange(type)}
                                    disabled={isLocked}
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
                            onClick={() => !isLocked && onChange('recursive', !recursive)}
                            className={`w-full py-1.5 px-3 text-xs rounded-md border transition-colors flex items-center justify-center gap-2
                                ${isLocked ? 'opacity-60 cursor-not-allowed bg-gray-50 border-gray-200 text-slate-400' :
                                  recursive 
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
                            disabled={isLocked}
                            className={`w-full border text-slate-700 text-sm rounded-md px-3 py-1.5 
                                     focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 
                                     transition-colors
                                     ${isLocked ? 'bg-gray-50 text-slate-400 cursor-not-allowed' : 'bg-white border-gray-200'}`}
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
        </div>
    );
});
