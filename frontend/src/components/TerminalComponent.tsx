import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X } from 'lucide-react';

export interface TerminalRef {
    runCommand: (cmd: string) => void;
    stop: () => void;
    clear: () => void;
}

interface TerminalComponentProps {
    onClose: () => void;
    onCommandComplete?: (exitCode: number) => void;
    hideToolbar?: boolean;
    mode?: 'interactive' | 'stream';
    nodeId?: string;
}

const TerminalComponent = forwardRef<TerminalRef, TerminalComponentProps>(({
    onClose,
    onCommandComplete,
    hideToolbar,
    mode = 'interactive',
    nodeId
}, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const bufferRef = useRef("");

    const onExecuteRef = useRef(onCommandComplete);

    // Keep ref updated
    useEffect(() => {
        onExecuteRef.current = onCommandComplete;
    }, [onCommandComplete]);

    useImperativeHandle(ref, () => ({
        runCommand: (cmd: string) => {
            if (mode === 'stream') {
                console.warn("Cannot run commands in stream mode");
                return;
            }
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                // Command Sentinel for exit code detection
                const sentinel = `\nprintf "\\x1b]1337;DONE:%d\\x07" $?\r`;
                const fullCommand = cmd + sentinel;

                wsRef.current.send(JSON.stringify({
                    type: 'input',
                    data: fullCommand
                }));
            }
        },
        stop: () => {
            if (mode === 'stream') return;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input', data: '\x03' }));
            }
        },
        clear: () => {
            xtermRef.current?.clear();
        }
    }));

    useEffect(() => {
        if (!terminalRef.current) return;

        let term: Terminal | null = null;
        let ws: WebSocket | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;

        const initTerminal = () => {
            if (term) return;

            // Initialize Xterm
            term = new Terminal({
                cursorBlink: mode === 'interactive',
                fontSize: 12,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                theme: {
                    background: '#1e1e1e',
                    foreground: '#f3f4f6',
                    cursor: '#6366f1',
                },
                disableStdin: mode === 'stream', // Read-only in stream mode
                convertEol: true, // Help with newline conversion
            });

            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            if (terminalRef.current) {
                term.open(terminalRef.current);
                try { fitAddon.fit(); } catch (e) { }
            }

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            // --- WebSocket Setup ---
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname;
            const port = '8000'; // Make sure this matches your backend port

            // Interactive = PTY (Single Session)
            // Stream = Workflow Bus (Broadcast)
            const wsUrl = mode === 'interactive'
                ? `${protocol}//${host}:${port}/ws/terminal`
                : `${protocol}//${host}:${port}/ws/workflow`;

            console.log(`[Terminal] Connecting to ${wsUrl} in mode: ${mode}`);

            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setStatus('connected');
                const msg = mode === 'interactive'
                    ? '\x1b[32m\r\n[Connected to PTY Session]\x1b[0m\r\n'
                    : `\x1b[32m\r\n[Connected to Workflow Stream: ${nodeId}]\x1b[0m\r\n`;
                term?.write(msg);

                // Initial Resize
                if (mode === 'interactive' && fitAddon) {
                    const dims = fitAddon.proposeDimensions();
                    if (dims) ws?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                }
            };

            ws.onmessage = (event) => {
                if (!term) return;

                if (mode === 'interactive') {
                    // --- INTERACTIVE MODE (Raw Text) ---
                    term.write(event.data);

                    // Handle Sentinel for Exit Codes
                    if (onExecuteRef.current) {
                        const chunk = event.data as string;
                        bufferRef.current += chunk;
                        // Limit buffer size to prevent memory leaks
                        if (bufferRef.current.length > 2000) bufferRef.current = bufferRef.current.slice(-2000);

                        // Regex to find hidden exit code
                        const match = bufferRef.current.match(/\x1b]1337;DONE:(\d+)\x07/);
                        if (match) {
                            onExecuteRef.current(parseInt(match[1], 10));
                            bufferRef.current = "";
                        }
                    }
                } else {
                    // --- STREAM MODE (JSON Protocol) ---
                    try {
                        const msg = JSON.parse(event.data);

                        // DEBUG: Uncomment this if streams are still not showing
                        // console.log("Stream Msg:", msg, "Target Node:", nodeId);

                        // Filter: Only show logs for THIS specific node
                        // FIX: Ensure backend sends 'nodeId' exactly as expected
                        if (msg.type === "node_log" && msg.data?.nodeId === nodeId) {

                            // FIX: Xterm needs \r\n for newlines, backend usually sends \n
                            let logText = msg.data.log || "";

                            // Replace plain \n with \r\n to prevent "staircasing" text
                            if (typeof logText === 'string') {
                                logText = logText.replace(/\n/g, '\r\n');
                            }

                            term.write(logText);
                        }
                    } catch (e) {
                        console.error("Failed to parse stream message", e);
                    }
                }
            };

            ws.onclose = () => {
                setStatus('disconnected');
            };

            ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                setStatus('disconnected');
                term?.write('\r\n\x1b[31m[WebSocket Error - Check Console]\x1b[0m\r\n');
            };

            // Handle User Input (Only in Interactive Mode)
            if (mode === 'interactive') {
                term.onData((data) => {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'input', data: data }));
                    }
                });
            }
        };

        // Resize Observer Logic
        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    if (!term) {
                        requestAnimationFrame(initTerminal);
                    } else if (fitAddon) {
                        requestAnimationFrame(() => {
                            try {
                                fitAddon?.fit();
                                if (mode === 'interactive' && ws?.readyState === WebSocket.OPEN) {
                                    const dims = fitAddon?.proposeDimensions();
                                    if (dims) ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                                }
                            } catch (e) { }
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
    }, [mode, nodeId]); // Re-run if mode changes (Run vs Edit) or Node ID changes

    return (
        <div className="flex flex-col h-full w-full bg-[#1e1e1e] rounded-b-md overflow-hidden relative">
            {!hideToolbar && (
                <div className="flex justify-between items-center px-2 py-1 bg-gray-800 border-b border-gray-700 select-none">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] text-gray-400 font-mono uppercase">
                            {mode} :: {status}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={14} /></button>
                </div>
            )}
            <div className="relative flex-1 w-full h-full min-h-[100px] p-1">
                <div ref={terminalRef} className="w-full h-full" />
            </div>
        </div>
    );
});

TerminalComponent.displayName = 'TerminalComponent';
export default React.memo(TerminalComponent);
