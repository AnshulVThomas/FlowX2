import { useState, useEffect } from 'react';
import { ShieldAlert, X, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface SudoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => Promise<void>;
    sudoCount: number;
}

export function SudoModal({ isOpen, onClose, onConfirm, sudoCount }: SudoModalProps) {
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!password) {
            toast.error("Password is required");
            return;
        }
        setIsSubmitting(true);
        await onConfirm(password);
        setIsSubmitting(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-yellow-500/20 bg-[#1a1a1a] shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between border-b border-white/5 p-4 bg-yellow-500/5">
                    <div className="flex items-center gap-2 text-yellow-500">
                        <ShieldAlert size={18} />
                        <span className="font-semibold tracking-wide text-sm">Privilege Required</span>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-yellow-500/10 rounded-full text-yellow-500 flex-shrink-0">
                            <Lock size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-medium text-white mb-1">Authorization Needed</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                <span className="font-bold text-yellow-400">{sudoCount} node{sudoCount > 1 ? 's' : ''}</span> requires elevated privileges.
                                Enter sudo password to authorize execution.
                            </p>
                        </div>
                    </div>

                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        autoFocus
                        placeholder="System Password"
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all font-mono text-sm"
                    />
                </div>

                <div className="flex items-center justify-end gap-3 bg-white/5 p-4 border-t border-white/5">
                    <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!password || isSubmitting}
                        className="rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-2 text-sm font-bold shadow-lg shadow-yellow-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Verifying...' : 'Authorize Run'}
                    </button>
                </div>
            </div>
        </div>
    );
}
