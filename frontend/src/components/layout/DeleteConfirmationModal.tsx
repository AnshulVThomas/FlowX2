import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    workflowName: string;
}

export function DeleteConfirmationModal({ isOpen, onClose, onConfirm, workflowName }: DeleteConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between border-b border-white/5 p-4">
                    <h2 className="text-lg font-semibold text-white">Delete Workflow</h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="rounded-full bg-red-500/10 p-3 text-red-500">
                            <AlertTriangle size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="mb-2 text-base font-medium text-white">
                                Are you sure?
                            </h3>
                            <p className="text-sm text-gray-400">
                                You are about to delete <span className="font-semibold text-white">"{workflowName}"</span>.
                                This action cannot be undone and all data associated with this workflow will be permanently lost.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 bg-white/5 p-4">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                        Delete Workflow
                    </button>
                </div>
            </div>
        </div>
    );
}
