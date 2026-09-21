// ============================================================================
// useSSE — Custom React hook for Server-Sent Events with polling fallback
// ----------------------------------------------------------------------------
// Connects to /api/events/stream, handles reconnection on disconnect,
// and falls back to HTTP polling when SSE fails after multiple retries.
//
// Usage:
//   const { connected, lastEvent, mode } = useSSE();
//   useEffect(() => { if (lastEvent?.type === 'parcel-synced') refresh(); }, [lastEvent]);
//
// Modes:
//   'sse'     — Real-time SSE connection active
//   'polling' — SSE failed, falling back to HTTP polling every 5s
//   'offline' — Both SSE and polling failed
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthToken, apiFetch } from './api';

const SSE_RECONNECT_DELAY = 3000;       // 3s between SSE reconnect attempts
const SSE_MAX_RETRIES = 5;              // After 5 failed attempts, switch to polling
const POLLING_INTERVAL = 5000;          // 5s polling fallback interval
const EVENT_TYPES = ['user-synced', 'parcel-synced', 'location-synced', 'parcel-updated', 'peak-alert', 'notification-synced', 'duty-status-synced'];

// Browser notification labels for SSE events
const EVENT_NOTIFICATIONS = {
    'user-synced':    { title: 'New User Synced', body: (d) => `${d.name} (${d.role}) registered` },
    'parcel-synced':  { title: 'Parcel Synced', body: (d) => `Tracking #${d.trackingNumber}` },
    'location-synced':{ title: 'Location Updated', body: (d) => `Parcel ${d.parcelId} location synced` },
    'parcel-updated': { title: 'Parcel Updated', body: (d) => `${d.trackingNumber} status: ${d.status}` },
    'peak-alert':     { title: 'Peak Connection Alert', body: (d) => `${d.count} clients (threshold: ${d.threshold})` },
    'notification-synced': { title: 'App Notification', body: (d) => d.title || 'New event from the mobile app' },
    'duty-status-synced':  { title: 'Rider Duty Update', body: (d) => `${d.riderName || d.email} is now ${d.isOnDuty ? 'On Duty' : 'Off Duty'}` },
};

export default function useSSE() {
    const [connected, setConnected] = useState(false);
    const [mode, setMode] = useState('sse'); // 'sse' | 'polling' | 'offline'
    const [lastEvent, setLastEvent] = useState(null);

    const reconnectTimeoutRef = useRef(null);
    const pollingIntervalRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const listenersRef = useRef(new Map());
    const lastPollTimestampRef = useRef(null);
    const mountedRef = useRef(true);

    // ── Browser notification helper ─────────────────────────────────────
    const showNotification = useCallback((type, data) => {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;

        const config = EVENT_NOTIFICATIONS[type];
        if (!config) return;

        try {
            new Notification(config.title, {
                body: config.body(data),
                icon: '/favicon.ico',
                tag: `yto-${type}`,
                renotify: true,
            });
        } catch { /* Notification API unavailable or blocked */ }
    }, []);

    // Request notification permission on first connect
    const requestNotificationPermission = useCallback(() => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // ── Dispatch event to listeners ──────────────────────────────────────
    const dispatchEvent = useCallback((type, data) => {
        setLastEvent({ type, data, timestamp: Date.now() });
        showNotification(type, data);
        const typeListeners = listenersRef.current.get(type);
        if (typeListeners) {
            typeListeners.forEach(fn => fn(data));
        }
    }, [showNotification]);

    // ── Polling fallback ─────────────────────────────────────────────────
    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) return; // already polling
        setMode('polling');
        setConnected(false);

        const poll = async () => {
            if (!mountedRef.current) return;
            try {
                const since = lastPollTimestampRef.current || new Date(Date.now() - 60000).toISOString();
                const res = await apiFetch(`/activity-log?limit=10`);
                if (res.ok) {
                    const events = await res.json();
                    // Check for new events since last poll
                    const newEvents = events.filter(e => new Date(e.timestamp) > new Date(since));
                    if (newEvents.length > 0) {
                        // Dispatch the most recent event
                        const latest = newEvents[0];
                        dispatchEvent('activity-update', {
                            events: newEvents,
                            latest: latest,
                            timestamp: new Date().toISOString(),
                        });
                        lastPollTimestampRef.current = newEvents[0].timestamp;
                    }
                }
            } catch (err) {
                console.warn('[Polling] Error:', err.message);
            }
        };

        // Initial poll
        poll();
        pollingIntervalRef.current = setInterval(poll, POLLING_INTERVAL);
    }, [dispatchEvent]);

    const stopPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    }, []);

    // ── Fetch-based SSE reader (2026 audit M5) ─────────────────────────────
    // EventSource cannot send request headers, so the JWT previously rode the
    // query string (?token=) where it leaks into access logs/proxies/history.
    // fetch() CAN set an Authorization header, so the token travels in the
    // header instead and never appears in the URL. Frame parsing (event:/data:
    // lines, blank-line dispatch) matches the SSE spec subset the server
    // emits; the reconnect/polling state machine below is unchanged.
    const abortRef = useRef(null);

    const readStream = useCallback(async (reader, decoder, onFrame) => {
        let buffer = '';
        let eventName = null;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, idx).replace(/\r$/, '');
                buffer = buffer.slice(idx + 1);
                if (line === '') {
                    eventName = null; // blank line: dispatch boundary
                } else if (line.startsWith(':')) {
                    // comment/heartbeat — ignore
                } else if (line.startsWith('event:')) {
                    eventName = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    onFrame(eventName || 'message', line.slice(5).trim());
                }
            }
        }
    }, []);

    // ── SSE connection ───────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        // Clean up existing connection
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }

        const token = getAuthToken();
        const baseUrl = import.meta.env.VITE_API_URL || 'https://yto-express-backend.onrender.com';
        const url = `${baseUrl}/api/events/stream`;

        const controller = new AbortController();
        abortRef.current = controller;

        (async () => {
            try {
                const res = await fetch(url, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    signal: controller.signal,
                });
                if (!res.ok || !res.body) throw new Error(`stream rejected: ${res.status}`);

                esOpen();
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                await readStream(reader, decoder, (type, raw) => {
                    if (!mountedRef.current) return;
                    try {
                        const data = JSON.parse(raw);
                        if (EVENT_TYPES.includes(type)) dispatchEvent(type, data);
                    } catch { /* non-JSON frame: ignore */ }
                });
                throw new Error('stream closed by server');
            } catch (err) {
                if (!mountedRef.current || controller.signal.aborted) return;
                esError();
            }
        })();

        const esOpen = () => {
            if (!mountedRef.current) return;
            setConnected(true);
            setMode('sse');
            reconnectAttemptsRef.current = 0;
            stopPolling(); // Switch back from polling to SSE
            requestNotificationPermission();
        };

        const esError = () => {
            if (!mountedRef.current) return;
            setConnected(false);
            reconnectAttemptsRef.current += 1;

            if (reconnectAttemptsRef.current >= SSE_MAX_RETRIES) {
                // Too many failures — switch to polling
                console.warn(`[SSE] Failed ${SSE_MAX_RETRIES} times. Switching to polling.`);
                startPolling();
            } else {
                console.warn(`[SSE] Connection lost. Attempt ${reconnectAttemptsRef.current}/${SSE_MAX_RETRIES}. Reconnecting...`);
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, SSE_RECONNECT_DELAY);
            }
        };
    }, [dispatchEvent, startPolling, stopPolling, requestNotificationPermission, readStream]);

    // ── Lifecycle ────────────────────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            if (abortRef.current) {
                abortRef.current.abort();
                abortRef.current = null;
            }
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            stopPolling();
        };
    }, [connect, stopPolling]);

    // ── Register a listener for a specific event type ────────────────────
    const on = useCallback((eventType, callback) => {
        if (!listenersRef.current.has(eventType)) {
            listenersRef.current.set(eventType, new Set());
        }
        listenersRef.current.get(eventType).add(callback);
        return () => {
            listenersRef.current.get(eventType)?.delete(callback);
        };
    }, []);

    // ── Manual retry (for UI retry button) ───────────────────────────────
    const retry = useCallback(() => {
        reconnectAttemptsRef.current = 0;
        stopPolling();
        connect();
    }, [connect, stopPolling]);

    return { connected, mode, lastEvent, on, retry };
}
