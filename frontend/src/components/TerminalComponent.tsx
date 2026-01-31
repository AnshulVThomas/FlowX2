import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X } from 'lucide-react';

export interface TerminalRef {
    runCommand: (cmd: string) => void;
    stop: () => void;
}

interface TerminalComponentProps {
    onClose: () => void;
    onCommandComplete?: (exitCode: number) => void;
    hideToolbar?: boolean;
}

const TerminalComponent = forwardRef<TerminalRef, TerminalComponentProps>(({ onClose, onCommandComplete, hideToolbar }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const bufferRef = useRef(""); // Rolling buffer for fragmentation

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        runCommand: (cmd: string) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                // Robust Command Construction:
                // 1. \n handles single-line comments (#) and ensures we start a new command
                // 2. printf sends the OSC code with the exit status ($?)
                const sentinel = `\nprintf "\\x1b]1337;DONE:%d\\x07" $?\r`;
                const fullCommand = cmd + sentinel;

                wsRef.current.send(JSON.stringify({
                    type: 'input',
                    data: fullCommand
                }));
            }
        },
        stop: () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                // Send Ctrl+C
                wsRef.current.send(JSON.stringify({
                    type: 'input',
                    data: '\x03'
                }));
            }
        }
    }));

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#1e1e1e', // Match CommandNode background
                foreground: '#f3f4f6', // Gray 100
                cursor: '#6366f1', // Indigo 500
            },
            disableStdin: false,
            convertEol: true,
            allowProposedApi: true, // Allow OSC codes
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
        bufferRef.current = "";

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
        };

        ws.onmessage = (event) => {
            // Write to terminal immediately (OSC codes are hidden by xterm)
            term.write(event.data);

            // Sentinel Detection Logic
            if (onCommandComplete) {
                const chunk = event.data as string; // WebSocket sends text by default in our backend
                bufferRef.current += chunk;

                // Limit buffer to prevent leaks (last 1000 chars is plenty for the marker)
                if (bufferRef.current.length > 1000) {
                    bufferRef.current = bufferRef.current.slice(-1000);
                }

                // Check for marker: \x1b]1337;DONE:123\x07
                const match = bufferRef.current.match(/\x1b]1337;DONE:(\d+)\x07/);
                if (match) {
                    const exitCode = parseInt(match[1], 10);
                    onCommandComplete(exitCode);
                    bufferRef.current = ""; // Clear buffer after detection
                }
            }
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

        // Handle resizing via ResizeObserver (Robust for container changes)
        const resizeObserver = new ResizeObserver(() => {
            if (terminalRef.current && ws.readyState === WebSocket.OPEN) {
                // Wait for layout update
                requestAnimationFrame(() => {
                    fitAddon.fit();
                    const dims = fitAddon.proposeDimensions();
                    if (dims) {
                        ws.send(JSON.stringify({
                            type: 'resize',
                            cols: dims.cols,
                            rows: dims.rows
                        }));
                    }
                });
            }
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        // Cleanup
        return () => {
            resizeObserver.disconnect();
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            term.dispose();
        };
    }, []);

    return (
        <div className="flex flex-col h-full w-full bg-gray-900 rounded-b-md overflow-hidden relative">
            {/* Toolbar */}
            {!hideToolbar && (
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
                        title="Hide Terminal"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Terminal Container */}
            <div ref={terminalRef} className="flex-1 w-full h-full" style={{ minHeight: '300px' }} />
        </div>
    );
});

TerminalComponent.displayName = 'TerminalComponent';

// Memoize the component to prevent re-renders when parent props change but terminal props don't
export default React.memo(TerminalComponent);
