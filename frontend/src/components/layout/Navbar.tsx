import { Plus, X } from 'lucide-react';
import { useWorkflowStore } from '../../store/useWorkflowStore';

export function Navbar() {
    const { workflows, activeId, setActiveWorkflow, createWorkflow, deleteWorkflow } = useWorkflowStore();

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 rounded-full border border-white/20 bg-black/40 backdrop-blur-md shadow-xl">
            <div className="flex items-center gap-2 px-2">
                {workflows.map((workflow) => (
                    <div
                        key={workflow.id}
                        onClick={() => setActiveWorkflow(workflow.id)}
                        className={`
              relative group flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer transition-all duration-300
              ${activeId === workflow.id
                                ? 'bg-blue-500/80 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-white/5 text-gray-300 hover:bg-white/10'
                            }
            `}
                    >
                        <span className="text-sm font-medium">{workflow.name}</span>
                        {workflows.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteWorkflow(workflow.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/20 rounded-full transition-opacity"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="w-[1px] h-6 bg-white/10 mx-1" />

            <button
                onClick={createWorkflow}
                className="p-2 rounded-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                title="Create New Workflow"
            >
                <Plus size={20} />
            </button>
        </div>
    );
}
