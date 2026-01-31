import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X } from 'lucide-react';

interface TerminalComponentProps {
    initialCommand?: string;
    onClose: () => void;
}

const TerminalComponent: React.FC<TerminalComponentProps> = ({ initialCommand, onClose }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#111827', // Gray 900
                foreground: '#f3f4f6', // Gray 100
                cursor: '#6366f1', // Indigo 500
            },
            disableStdin: false,
            convertEol: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Connect WebSocket
        const wsUrl = `ws://${window.location.hostname}:8000/ws/terminal`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('connected');
            term.write('\x1b[32m\r\nConnected to PTY Session...\x1b[0m\r\n');

            // Send initial resize
            const dims = fitAddon.proposeDimensions();
            if (dims) {
                ws.send(JSON.stringify({
                    type: 'resize',
                    cols: dims.cols,
                    rows: dims.rows
                }));
            }

            // Auto-run command if provided
            if (initialCommand) {
                // Add a small delay/newline to ensure it runs nicely
                setTimeout(() => {
                    // Send as structured input or just write it
                    // Sending as 'input' type to match our backend protocol
                    ws.send(JSON.stringify({
                        type: 'input',
                        data: initialCommand + '\r'
                    }));
                }, 500);
            }
        };

        ws.onmessage = (event) => {
            term.write(event.data);
        };

        ws.onclose = () => {
            setStatus('disconnected');
            term.write('\r\n\x1b[31mConnection closed.\x1b[0m');
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            term.write('\r\n\x1b[31mConnection error.\x1b[0m');
        };

        // Terminal Input -> WebSocket
        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'input',
                    data: data
                }));
            }
        });

        // Handle window resize
        const handleResize = () => {
            fitAddon.fit();
            const dims = fitAddon.proposeDimensions();
            if (dims && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'resize',
                    cols: dims.cols,
                    rows: dims.rows
                }));
            }
        };

        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            term.dispose();
        };
    }, []); // Empty dependency array, but we use refs for latest values if needed. 
    // Usually safe for terminal init. If initialCommand changes, we might want to re-run, but 
    // standard terminal lifecycle suggests unmount/remount for new session usually.

    return (
        <div className="flex flex-col h-full w-full bg-gray-900 rounded-b-md overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex justify-between items-center px-2 py-1 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] text-gray-400 font-mono">
                        {status === 'connected' ? 'Interactive Session' : status}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Terminal Container */}
            <div ref={terminalRef} className="flex-1 w-full h-full" style={{ minHeight: '300px' }} />
        </div>
    );
};

export default TerminalComponent;
