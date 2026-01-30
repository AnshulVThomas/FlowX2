import { Plus, X, Save, Activity } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { saveWorkflow } from '../../services/api';
import { useServerStatus } from '../../hooks/useServerStatus';
import { toast } from 'sonner';

export function Navbar() {
    const { workflows, activeId, setActiveWorkflow, createWorkflow, deleteWorkflow, updateWorkflowName } = useWorkflowStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const isConnected = useServerStatus();

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingId]);

    const handleDoubleClick = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    const handleSaveName = () => {
        if (editingId && editName.trim()) {
            updateWorkflowName(editingId, editName.trim());
        }
        setEditingId(null);
    };

    const handleSaveData = async () => {
        const activeWorkflow = workflows.find(w => w.id === activeId);
        if (activeWorkflow) {
            try {
                await saveWorkflow(activeWorkflow);
                toast.success('Workflow saved successfully');
            } catch (error) {
                toast.error('Failed to save workflow');
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveName();
        } else if (e.key === 'Escape') {
            setEditingId(null);
        }
    };

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-1.5 rounded-full border border-white/20 bg-black/40 backdrop-blur-md shadow-xl">
            <div className={`p-2 rounded-full ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} transition-colors`} title={isConnected ? "Server Online" : "Server Offline"}>
                <Activity size={18} />
            </div>
            <div className="flex items-center gap-1 px-1">
                {workflows.map((workflow) => (
                    <div
                        key={workflow.id}
                        onClick={() => setActiveWorkflow(workflow.id)}
                        onDoubleClick={() => handleDoubleClick(workflow.id, workflow.name)}
                        className={`
              relative group flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-all duration-300 border border-transparent
              ${activeId === workflow.id
                                ? 'bg-white/10 text-white border-white/10 shadow-sm'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }
            `}
                    >
                        {editingId === workflow.id ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={handleSaveName}
                                onKeyDown={handleKeyDown}
                                className="w-24 bg-transparent border-b border-white/50 outline-none text-sm font-medium text-white px-1"
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span className="text-sm font-medium select-none truncate max-w-[120px]">{workflow.name}</span>
                        )}

                        {workflows.length > 1 && !editingId && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteWorkflow(workflow.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-all"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="w-[1px] h-6 bg-white/10 mx-2" />

            <div className="flex items-center gap-1 pr-1">
                <button
                    onClick={createWorkflow}
                    className="p-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                    title="Create New Workflow"
                >
                    <Plus size={18} />
                </button>
                <button
                    onClick={handleSaveData}
                    className="p-2 rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors border border-blue-500/20"
                    title="Save Workflow"
                >
                    <Save size={18} />
                </button>
            </div>
        </div>
    );
}
