import { useState, useEffect, useRef } from 'react';

const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('http', 'ws') + '/ws' : 'ws://localhost:8000/ws';

export function useServerStatus() {
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        const connect = () => {
            if (ws.current?.readyState === WebSocket.OPEN) return;

            ws.current = new WebSocket(SOCKET_URL);

            ws.current.onopen = () => {
                setIsConnected(true);
            };

            ws.current.onclose = () => {
                setIsConnected(false);
                // Try to reconnect in 3 seconds
                setTimeout(connect, 3000);
            };

            ws.current.onerror = () => {
                setIsConnected(false);
                ws.current?.close();
            };
        };

        connect();

        return () => {
            ws.current?.close();
        };
    }, []);

    return isConnected;
}
