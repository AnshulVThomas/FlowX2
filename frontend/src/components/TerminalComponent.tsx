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

    const onExecuteRef = useRef(onCommandComplete);

    // Keep ref updated
    useEffect(() => {
        onExecuteRef.current = onCommandComplete;
    }, [onCommandComplete]);

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

        let term: Terminal | null = null;
        let ws: WebSocket | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;

        const initTerminal = () => {
            if (term) return; // Already initialized

            console.log("Initializing Terminal...");

            term = new Terminal({
                cursorBlink: true,
                fontSize: 12,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                theme: {
                    background: '#1e1e1e',
                    foreground: '#f3f4f6',
                    cursor: '#6366f1',
                },
                disableStdin: false,
                convertEol: true,
                allowProposedApi: true,
            });

            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            // Ensure container is ready
            if (terminalRef.current) {
                term.open(terminalRef.current);
                try {
                    fitAddon.fit();
                } catch (e) { console.warn("Initial fit failed", e) }
            }

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            // Connect WebSocket
            const wsUrl = `ws://${window.location.hostname}:8000/ws/terminal`;
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;
            bufferRef.current = "";

            ws.onopen = () => {
                setStatus('connected');
                term?.write('\x1b[32m\r\nConnected to PTY Session...\x1b[0m\r\n');

                // Initial Resize
                if (fitAddon) {
                    try {
                        const dims = fitAddon.proposeDimensions();
                        if (dims) {
                            ws?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                        }
                    } catch (e) {
                        console.warn(e);
                    }
                }
            };

            ws.onmessage = (event) => {
                term?.write(event.data);

                if (onExecuteRef.current) {
                    const chunk = event.data as string;
                    bufferRef.current += chunk;
                    if (bufferRef.current.length > 1000) bufferRef.current = bufferRef.current.slice(-1000);
                    const match = bufferRef.current.match(/\x1b]1337;DONE:(\d+)\x07/);
                    if (match) {
                        const exitCode = parseInt(match[1], 10);
                        onExecuteRef.current(exitCode);
                        bufferRef.current = "";
                    }
                }
            };

            ws.onclose = () => { setStatus('disconnected'); term?.write('\r\n\x1b[31mConnection closed.\x1b[0m'); };
            ws.onerror = (err) => { console.error('WebSocket error:', err); term?.write('\r\n\x1b[31mConnection error.\x1b[0m'); };

            term.onData((data) => {
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'input', data: data }));
                }
            });
        };

        // Observe for visibility/size
        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    if (!term) {
                        // First time visible: Initialize
                        requestAnimationFrame(initTerminal);
                    } else if (fitAddon && ws?.readyState === WebSocket.OPEN) {
                        // Subsequent resizes
                        requestAnimationFrame(() => {
                            try {
                                fitAddon?.fit();
                                const dims = fitAddon?.proposeDimensions();
                                if (dims) {
                                    ws?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                                }
                            } catch (e) { console.warn("Resize fit error", e); }
                        });
                    }
                }
            }
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        return () => {
            resizeObserver?.disconnect();
            if (ws && ws.readyState === WebSocket.OPEN) ws.close();
            term?.dispose();
            wsRef.current = null;
            xtermRef.current = null;
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
