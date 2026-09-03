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
const EVENT_TYPES = ['user-synced', 'parcel-synced', 'location-synced', 'parcel-updated', 'peak-alert'];

// Browser notification labels for SSE events
const EVENT_NOTIFICATIONS = {
    'user-synced':    { title: 'New User Synced', body: (d) => `${d.name} (${d.role}) registered` },
    'parcel-synced':  { title: 'Parcel Synced', body: (d) => `Tracking #${d.trackingNumber}` },
    'location-synced':{ title: 'Location Updated', body: (d) => `Parcel ${d.parcelId} location synced` },
    'parcel-updated': { title: 'Parcel Updated', body: (d) => `${d.trackingNumber} status: ${d.status}` },
    'peak-alert':     { title: 'Peak Connection Alert', body: (d) => `${d.count} clients (threshold: ${d.threshold})` },
};

export default function useSSE() {
    const [connected, setConnected] = useState(false);
    const [mode, setMode] = useState('sse'); // 'sse' | 'polling' | 'offline'
    const [lastEvent, setLastEvent] = useState(null);

    const eventSourceRef = useRef(null);
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
        } catch {}
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
    }, []);

    // ── Polling fallback ─────────────────────────────────────────────────
    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) return; // already polling
        setMode('polling');
        setConnected(false);
        console.log('[SSE] Falling back to HTTP polling');

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

    // ── SSE connection ───────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        // Clean up existing connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const token = getAuthToken();
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

        // SSE doesn't support custom headers, so we pass token as query param
        const url = token
            ? `${baseUrl}/api/events/stream?token=${token}`
            : `${baseUrl}/api/events/stream`;

        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => {
            setConnected(true);
            setMode('sse');
            reconnectAttemptsRef.current = 0;
            stopPolling(); // Switch back from polling to SSE
            requestNotificationPermission();
            console.log('[SSE] Connected to event stream');
        };

        es.addEventListener('connected', (e) => {
            const data = JSON.parse(e.data);
            console.log('[SSE] Server confirmed:', data.message);
        });

        // Listen for bridge sync events
        EVENT_TYPES.forEach(type => {
            es.addEventListener(type, (e) => {
                const data = JSON.parse(e.data);
                dispatchEvent(type, data);
            });
        });

        es.onerror = () => {
            setConnected(false);
            es.close();
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
    }, [dispatchEvent, startPolling, stopPolling]);

    // ── Lifecycle ────────────────────────────────────────────────────────
    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            if (eventSourceRef.current) eventSourceRef.current.close();
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
