import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, type Connection } from '@xyflow/react';
import { RotateCcw } from 'lucide-react';

const ALLOWED_TARGETS = ['reactAgent'];

const RestartToolUI = ({ selected }: NodeProps) => {
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: any) => {
        const targetNode = getNode(connection.target);
        return !!(targetNode && ALLOWED_TARGETS.includes(targetNode.type || ''));
    }, [getNode]);

    return (

        <div className={`
            flex flex-col items-center gap-2 px-3 py-2 rounded-lg 
            bg-white border-2 transition-all duration-300 
            ${selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-gray-200 shadow-sm'}
        `}>
            {/* Icon & Label Group */}
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 rounded-md">
                    <RotateCcw size={16} className="text-amber-500" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">Restart Tool</span>
                    <span className="text-[10px] text-slate-400">Control</span>
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white hover:!bg-amber-400 transition-colors shadow-sm"
                isValidConnection={isValidConnection}
            />
        </div>
    );

};
export default memo(RestartToolUI);
