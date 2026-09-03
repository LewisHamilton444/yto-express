'use client';
import React, { useState, useEffect, useCallback } from 'react';
import useSSE from './services/useSSE';
import { apiFetch } from './services/api';

const PeakAlertBanner = () => {
    const { on } = useSSE();
    const [alerts, setAlerts] = useState([]);
    const [showBanner, setShowBanner] = useState(false);
    const [latestAlert, setLatestAlert] = useState(null);
    const [threshold, setThreshold] = useState(5);

    // Fetch existing alerts on mount
    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await apiFetch('/events/alerts');
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : [];
                    setAlerts(list);
                    if (list.length > 0) {
                        setLatestAlert(list[list.length - 1]);
                    }
                }
                const statsRes = await apiFetch('/events/stats');
                if (statsRes.ok) {
                    const stats = await statsRes.json();
                    setThreshold(stats?.threshold || 5);
                }
            } catch {}
        };
        fetchAlerts();
    }, []);

    // Listen for real-time peak alerts via SSE
    useEffect(() => {
        const unsubscribe = on('peak-alert', (data) => {
            if (!data || typeof data !== 'object') return;
            setLatestAlert(data);
            setAlerts(prev => [...prev.slice(-49), data]); // keep last 50
            setShowBanner(true);
            // Auto-dismiss after 8 seconds
            setTimeout(() => setShowBanner(false), 8000);
        });
        return unsubscribe;
    }, [on]);

    const dismiss = useCallback(() => setShowBanner(false), []);

    const formatTime = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // Don't render if no alerts and banner is hidden
    if (!showBanner && alerts.length === 0) return null;

    return (
        <>
            {/* Floating Alert Banner */}
            {showBanner && latestAlert && (
                <div style={{
                    position: 'fixed', top: 16, right: 16, zIndex: 10000,
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    color: 'white', padding: '14px 20px', borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(220,38,38,0.3)',
                    maxWidth: 380, animation: 'slideIn 0.3s ease',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}>
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Peak Connection Alert</div>
                                <div style={{ fontSize: 11, opacity: 0.9, lineHeight: 1.4 }}>
                                    {latestAlert.count} concurrent clients detected (threshold: {latestAlert.threshold})
                                </div>
                                <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>{formatTime(latestAlert.timestamp)}</div>
                            </div>
                        </div>
                        <button onClick={dismiss} style={{
                            background: 'none', border: 'none', color: 'white', cursor: 'pointer',
                            fontSize: 16, lineHeight: 1, padding: 0, opacity: 0.7,
                        }}>&times;</button>
                    </div>
                </div>
            )}

            {/* Alert History in Dashboard */}
            {alerts.length > 0 && !showBanner && (
                <div style={{
                    background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>
                        {alerts.length} peak alert{alerts.length !== 1 ? 's' : ''} recorded
                    </span>
                    <span style={{ fontSize: 10, color: '#dc2626', opacity: 0.7 }}>
                        (threshold: {threshold} clients)
                    </span>
                </div>
            )}

            {/* CSS Animation */}
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </>
    );
};

export default PeakAlertBanner;
