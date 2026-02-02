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
    shouldConnect?: boolean;
    initialLogs?: string[];
    runId?: string;
}

const TerminalComponent = forwardRef<TerminalRef, TerminalComponentProps>(({
    mode = 'interactive',
    onCommandComplete,
    onClose,
    hideToolbar = false,
    nodeId,
    shouldConnect,
    initialLogs,
    runId
}, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const bufferRef = useRef("");

    // FIX: Add state to track when XTerm is actually created
    const [isReady, setIsReady] = useState(false);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

    const onExecuteRef = useRef(onCommandComplete);

    // Keep ref updated
    useEffect(() => {
        onExecuteRef.current = onCommandComplete;
    }, [onCommandComplete]);

    // Exposed Methods
    useImperativeHandle(ref, () => ({
        runCommand: (cmd: string) => {
            if (mode === 'stream') {
                console.warn("Cannot run commands in stream mode");
                return;
            }
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
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

    // --- 1. INITIALIZATION EFFECT ---
    useEffect(() => {
        if (!terminalRef.current) return;

        // Lazy Connection Check
        if (!shouldConnect) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
                setStatus('disconnected');
            }
            return;
        }

        let term: Terminal | null = null;
        let ws: WebSocket | null = null;
        let fitAddon: FitAddon | null = null;
        let resizeObserver: ResizeObserver | null = null;

        const initTerminal = () => {
            if (term) return; // Prevent double init

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
                disableStdin: mode === 'stream',
                convertEol: true,
            });

            fitAddon = new FitAddon();
            term.loadAddon(fitAddon);

            if (terminalRef.current) {
                term.open(terminalRef.current);
                try { fitAddon.fit(); } catch (e) { }
            }

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            // FIX: Signal that terminal is ready for logs
            setIsReady(true);

            // --- WEBSOCKET LOGIC ---
            if (mode === 'interactive') {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.hostname;
                const port = '8000';
                const wsUrl = `${protocol}//${host}:${port}/ws/terminal`;

                ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    setStatus('connected');
                    term?.write('\x1b[32m\r\n[Connected to PTY Session]\x1b[0m\r\n');
                    if (fitAddon) {
                        const dims = fitAddon.proposeDimensions();
                        if (dims) ws?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                    }
                };

                ws.onmessage = (event) => {
                    if (!term) return;
                    term.write(event.data);

                    if (onExecuteRef.current) {
                        const chunk = event.data as string;
                        bufferRef.current += chunk;
                        if (bufferRef.current.length > 2000) bufferRef.current = bufferRef.current.slice(-2000);
                        const match = bufferRef.current.match(/\x1b]1337;DONE:(\d+)\x07/);
                        if (match) {
                            onExecuteRef.current(parseInt(match[1], 10));
                            bufferRef.current = "";
                        }
                    }
                };

                ws.onclose = () => setStatus('disconnected');
                ws.onerror = () => {
                    setStatus('disconnected');
                    term?.write('\r\n\x1b[31m[WebSocket Error]\x1b[0m\r\n');
                };

                term.onData((data) => {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'input', data: data }));
                    }
                });

            } else {
                // Stream Mode
                setStatus('connected');
                // term.write(`\x1b[32m\r\n[Str eam Ready: ${nodeId}]\x1b[0m\r\n`);
            }
        };

        // Resize Observer
        resizeObserver = new ResizeObserver((entries) => {
            // Safety: If component is unmounted, refs will be null
            if (!terminalRef.current) return;

            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    if (!xtermRef.current) {
                        requestAnimationFrame(initTerminal);
                    } else if (fitAddonRef.current) {
                        requestAnimationFrame(() => {
                            // Double Safety: Ensure terminal wasn't disposed while rAF was pending
                            if (!xtermRef.current || !fitAddonRef.current) return;

                            try {
                                fitAddonRef.current.fit();
                                if (mode === 'interactive' && wsRef.current?.readyState === WebSocket.OPEN) {
                                    const dims = fitAddonRef.current.proposeDimensions();
                                    if (dims) wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
                                }
                            } catch (e) {
                                // Ignore fit errors during fast resizes
                            }
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
            wsRef.current = null;
            term?.dispose();
            xtermRef.current = null;
            setIsReady(false); // Reset ready state on cleanup
        };
    }, [mode, nodeId, shouldConnect]);

    const hasHydratedRef = useRef(false);

    // --- 2. LOG LISTENER & REHYDRATION EFFECT ---
    useEffect(() => {
        // FIX: Add isReady check. If terminal isn't created, we can't write to it.
        if (!isReady || mode !== 'stream' || !nodeId || !shouldConnect) return;

        const term = xtermRef.current;
        if (!term) return; // Double safety check

        // 1. Rehydrate
        if (!hasHydratedRef.current && initialLogs && initialLogs.length > 0) {
            initialLogs.forEach(log => {
                let logText = log || "";
                if (typeof logText === 'string') {
                    logText = logText.replace(/\n/g, '\r\n');
                }
                term.write(logText);
            });
            hasHydratedRef.current = true;
        }

        // 2. Event Listener
        const handleLogEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            let logText = customEvent.detail?.log || "";
            if (typeof logText === 'string') {
                logText = logText.replace(/\n/g, '\r\n');
            }
            term.write(logText);
        };

        window.addEventListener(`node-log-${nodeId}`, handleLogEvent);
        return () => window.removeEventListener(`node-log-${nodeId}`, handleLogEvent);

        // FIX: Add isReady to dependency array so this runs AFTER initialization
    }, [mode, nodeId, shouldConnect, isReady]);

    // --- 3. AUTO-CLEAR ON RUN ID CHANGE ---
    useEffect(() => {
        // Only clear if terminal exists
        if (xtermRef.current && isReady) {
            xtermRef.current.clear();
            hasHydratedRef.current = false;
        }
    }, [runId, isReady]);

    // Reset hydration when nodeId changes
    useEffect(() => {
        hasHydratedRef.current = false;
    }, [nodeId]);

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
