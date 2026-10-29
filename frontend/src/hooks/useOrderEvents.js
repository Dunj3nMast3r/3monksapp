import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../services/api';

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 30000;

/**
 * Listens to the backend's live order events for a shop and calls onEvent for each
 * one, and once after every (re)connect so changes missed while offline are picked up.
 * Uses fetch rather than EventSource so the login token goes in the Authorization
 * header, not the URL. Returns whether the stream is currently connected.
 */
export default function useOrderEvents(shopId, onEvent) {
    const [connected, setConnected] = useState(false);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
        let stopped = false;
        let controller = null;
        let retryTimer = null;
        let retryMs = RETRY_MIN_MS;

        const handleBlock = (block) => {
            let name = 'message';
            const data = [];
            block.split('\n').forEach(line => {
                if (line.startsWith('event:')) name = line.slice(6).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).trim());
            });
            if (name !== 'order' || data.length === 0) return;
            try { onEventRef.current(JSON.parse(data.join('\n'))); } catch (_) { /* malformed event */ }
        };

        const connect = async () => {
            controller = new AbortController();
            try {
                const query = shopId ? `?shopId=${shopId}` : '';
                const res = await fetch(`${API_BASE_URL}/api/orders/stream${query}`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, Accept: 'text/event-stream' },
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!res.ok || !res.body) throw new Error(`Order stream failed: ${res.status}`);
                setConnected(true);
                retryMs = RETRY_MIN_MS;
                onEventRef.current({ type: 'CONNECTED' });

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
                    let end;
                    while ((end = buffer.indexOf('\n\n')) >= 0) {
                        handleBlock(buffer.slice(0, end));
                        buffer = buffer.slice(end + 2);
                    }
                }
            } catch (_) {
                /* aborted, offline or server restart: retry below */
            }
            setConnected(false);
            if (!stopped) {
                retryTimer = setTimeout(connect, retryMs);
                retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
            }
        };

        connect();
        return () => {
            stopped = true;
            clearTimeout(retryTimer);
            if (controller) controller.abort();
        };
    }, [shopId]);

    return connected;
}
