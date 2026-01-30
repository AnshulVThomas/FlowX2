import { Plus, X, Save, Activity, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { saveWorkflow } from '../../services/api';
import { useServerStatus } from '../../hooks/useServerStatus';
import { toast } from 'sonner';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

export function Navbar() {
    const { workflows, activeId, setActiveWorkflow, createWorkflow, deleteWorkflow, updateWorkflowName, markClean, isCreatingWorkflow, startWorkflowCreation, cancelWorkflowCreation } = useWorkflowStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [newWorkflowName, setNewWorkflowName] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const newWorkflowInputRef = useRef<HTMLInputElement>(null);
    const isConnected = useServerStatus();

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingId]);

    useEffect(() => {
        if (isCreatingWorkflow && newWorkflowInputRef.current) {
            newWorkflowInputRef.current.focus();
        }
    }, [isCreatingWorkflow]);

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
                markClean(activeWorkflow.id);
                toast.success('Workflow saved successfully');
            } catch (error) {
                toast.error('Failed to save workflow');
            }
        }
    };

    // Get active workflow dirty state
    const activeWorkflow = workflows.find(w => w.id === activeId);
    const isDirty = activeWorkflow?.isDirty ?? false;

    const handleDeleteConfirm = async () => {
        if (deleteId) {
            try {
                await deleteWorkflow(deleteId);
                toast.success('Workflow deleted');
            } catch (error) {
                toast.error('Failed to delete workflow');
            }
            setDeleteId(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveName();
        } else if (e.key === 'Escape') {
            setEditingId(null);
        }
    };

    const handleNewWorkflowKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreateWorkflow();
        } else if (e.key === 'Escape') {
            cancelWorkflowCreation();
            setNewWorkflowName('');
        }
    };

    const handleCreateWorkflow = async () => {
        if (newWorkflowName.trim()) {
            await createWorkflow(newWorkflowName);
            setNewWorkflowName('');
        } else {
            // If empty, use default name
            await createWorkflow('');
            setNewWorkflowName('');
        }
    };

    return (
        <>
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-1.5 rounded-full border border-white/20 bg-black/40 backdrop-blur-md shadow-xl max-w-[90vw]">
                <div className={`p-2 rounded-full ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} transition-colors flex-shrink-0`} title={isConnected ? "Server Online" : "Server Offline"}>
                    <Activity size={18} />
                </div>
                <div className="flex items-center gap-1 px-1 overflow-x-auto max-w-[60vw] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {workflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            onClick={() => setActiveWorkflow(workflow.id)}
                            onDoubleClick={() => handleDoubleClick(workflow.id, workflow.name)}
                            className={`
              relative group flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-all duration-300 border border-transparent flex-shrink-0
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
                                        setDeleteId(workflow.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-all"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}

                    {/* New Workflow Input - Bleed in */}
                    {isCreatingWorkflow && (
                        <div className="relative group flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/40 bg-purple-500/10 text-white shadow-sm flex-shrink-0 animate-in fade-in slide-in-from-right-2 duration-300">
                            <input
                                ref={newWorkflowInputRef}
                                type="text"
                                value={newWorkflowName}
                                onChange={(e) => setNewWorkflowName(e.target.value)}
                                onKeyDown={handleNewWorkflowKeyDown}
                                placeholder="Workflow name..."
                                className="w-32 bg-transparent border-b border-purple-400/50 outline-none text-sm font-medium text-white placeholder:text-gray-400 px-1"
                                onClick={(e) => e.stopPropagation()}
                            />
                            <button
                                onClick={handleCreateWorkflow}
                                className="p-0.5 hover:bg-green-500/20 text-gray-400 hover:text-green-400 rounded-full transition-all"
                                title="Create"
                            >
                                <Check size={14} />
                            </button>
                            <button
                                onClick={() => {
                                    cancelWorkflowCreation();
                                    setNewWorkflowName('');
                                }}
                                className="p-0.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-all"
                                title="Cancel"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-[1px] h-6 bg-white/10 mx-2 flex-shrink-0" />

                <div className="flex items-center gap-1 pr-1">
                    <button
                        onClick={startWorkflowCreation}
                        disabled={isCreatingWorkflow}
                        className={`p-2 rounded-full transition-colors ${isCreatingWorkflow
                            ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                        title="Create New Workflow"
                    >
                        <Plus size={18} />
                    </button>
                    <button
                        onClick={handleSaveData}
                        className={`p-2 rounded-full transition-all ${isDirty
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30 shadow-lg shadow-yellow-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20'
                            }`}
                        title={isDirty ? "Unsaved changes" : "Save Workflow"}
                    >
                        <Save size={18} />
                    </button>
                </div>
            </div>

            <DeleteConfirmationModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleDeleteConfirm}
                workflowName={workflows.find(w => w.id === deleteId)?.name || 'Workflow'}
            />
        </>
    );
}