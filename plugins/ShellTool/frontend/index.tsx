import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Terminal } from 'lucide-react';

const ShellToolUI = ({ selected }: NodeProps) => {
    return (
        <div className={`
            flex flex-col items-center gap-2 px-3 py-2 rounded-lg 
            bg-white border-2 transition-all duration-300 
            ${selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-200 shadow-sm'}
        `}>
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-md">
                    <Terminal size={16} className="text-blue-500" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Shell Tool</span>
                    <span className="text-[10px] text-slate-400">Capability</span>
                </div>
            </div>

            {/* OUTPUT HANDLE AT BOTTOM */}
            {/* Connects to the Top of the Agent */}
            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white hover:!bg-blue-400 transition-colors shadow-sm"
            />
        </div>
    );
};
export default memo(ShellToolUI);
