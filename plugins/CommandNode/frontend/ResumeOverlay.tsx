import { useState } from 'react';
import { Lock, Play, Loader2 } from 'lucide-react';
import { resumeWorkflow } from '@core/services/api';
import { toast } from 'sonner';

interface ResumeOverlayProps {
    threadId: string;
    workflowId: string; // Needed for resume rebuild
    onResumeSuccess?: (status: any) => void;
}

export function ResumeOverlay({ threadId, workflowId, onResumeSuccess }: ResumeOverlayProps) {
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleResume = async () => {
        if (!password) {
            toast.error("Password required");
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await resumeWorkflow(threadId, workflowId, password);
            toast.success("Resuming workflow...");
            if (onResumeSuccess) onResumeSuccess(result.status);
        } catch (error: any) {
            toast.error(error.message || "Failed to resume");
        } finally {
            setIsSubmitting(false);
            setPassword('');
        }
    };

    return (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
            <div className="bg-stone-900 border border-yellow-500/30 rounded-xl p-6 max-w-sm w-full shadow-2xl shadow-yellow-500/10">
                <div className="flex justify-center mb-4">
                    <div className="p-3 bg-yellow-500/20 rounded-full animate-pulse">
                        <Lock className="text-yellow-500" size={24} />
                    </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-100 mb-2">
                    Permission Required
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                    This command requires elevated privileges. Please enter the sudo password to proceed.
                </p>

                <div className="space-y-4">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Sudo Password"
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 transition-all"
                        onKeyDown={(e) => e.key === 'Enter' && handleResume()}
                        autoFocus
                    />

                    <button
                        onClick={handleResume}
                        disabled={isSubmitting || !password}
                        className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                        {isSubmitting ? 'Resuming...' : 'Inject Password & Resume'}
                    </button>

                    <div className="text-[10px] text-gray-600">
                        Password is injected directly into the execution stream and is not stored strictly.
                    </div>
                </div>
            </div>
        </div>
    );
}
