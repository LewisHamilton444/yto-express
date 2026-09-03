'use client';
import React, { useState, useEffect } from 'react';
import { apiFetch } from './services/api';

const ConnectionHistoryChart = () => {
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState({ current: 0, peak: 0, total: 0, threshold: 5 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 10000); // refresh every 10s
        return () => clearInterval(interval);
    }, []);

    const fetchHistory = async () => {
        try {
            const [statsRes, historyRes] = await Promise.all([
                apiFetch('/events/stats'),
                apiFetch('/events/history'),
            ]);

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats({
                    current: statsData.connectedClients || 0,
                    peak: statsData.peakConnections || 0,
                    total: statsData.totalEvents || 0,
                    threshold: statsData.threshold || 5,
                });
            }

            if (historyRes.ok) {
                const historyData = await historyRes.json();
                // Guard against non-array responses (error payloads, {}) —
                // buildChartData() calls history.forEach and used to crash the
                // whole dashboard when the endpoint didn't return an array.
                setHistory(Array.isArray(historyData) ? historyData : []);
            }
        } catch (err) {
            console.error('Error fetching SSE history:', err);
        } finally {
            setLoading(false);
        }
    };

    // Build chart data: group by minute and take max count per minute
    const buildChartData = () => {
        if (history.length === 0) return [];

        const grouped = {};
        (Array.isArray(history) ? history : []).forEach(entry => {
            const ts = typeof entry?.timestamp === 'string' ? entry.timestamp : '';
            const minute = ts.slice(0, 16); // YYYY-MM-DDTHH:MM
            if (!grouped[minute]) {
                grouped[minute] = { count: 0, events: 0 };
            }
            grouped[minute].count = Math.max(grouped[minute].count, Number(entry.count) || 0);
            grouped[minute].events++;
        });

        return Object.entries(grouped).slice(-20).map(([minute, data]) => ({
            label: minute.slice(11, 16), // HH:MM
            count: data.count,
            events: data.events,
        }));
    };

    const chartData = buildChartData();
    const maxCount = Math.max(...chartData.map(d => d.count), 1);

    if (loading) {
        return (
            <div style={{ padding: 20, textAlign: 'center', color: '#a890c0', fontSize: 12 }}>
                Loading connection history...
            </div>
        );
    }

    return (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e8e2f0', padding: '16px 20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#390955' }}>Connection History</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#a890c0' }}>SSE client connections over time</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {[
                        { label: 'Current', value: stats.current, color: '#390955' },
                        { label: 'Peak', value: stats.peak, color: '#F37021' },
                        { label: 'Events', value: stats.total, color: '#1E88E5' },
                    ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#a890c0', textTransform: 'uppercase' }}>{s.label}</div>
                        </div>
                    ))}
                    <button onClick={() => {
                        const headers = ['Timestamp', 'Count', 'Event'];
                        const rows = history.map(h => [h.timestamp, h.count, h.event]);
                        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'yto_connection_history.csv'; a.click();
                        URL.revokeObjectURL(url);
                    }} style={{ padding: '4px 10px', background: 'white', border: '1px solid #e0d5f0', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#390955', cursor: 'pointer' }}>
                        Export
                    </button>
                </div>
            </div>

            {/* Chart */}
            {chartData.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#c4b8d8', fontSize: 12 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4c8e8" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <p style={{ margin: 0 }}>No connection events recorded yet</p>
                    <p style={{ margin: '4px 0 0', fontSize: 10 }}>Events appear as clients connect and disconnect</p>
                </div>
            ) : (
                <div style={{ position: 'relative' }}>
                    {/* Y-axis labels */}
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 24, width: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4 }}>
                        <span style={{ fontSize: 9, color: '#a890c0' }}>{maxCount}</span>
                        <span style={{ fontSize: 9, color: '#a890c0' }}>{Math.round(maxCount / 2)}</span>
                        <span style={{ fontSize: 9, color: '#a890c0' }}>0</span>
                    </div>

                    {/* Grid lines */}
                    <div style={{ position: 'absolute', left: 28, right: 0, top: 0, bottom: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ borderBottom: '1px solid #f0eaf8', width: '100%' }} />
                        ))}
                    </div>

                    {/* Threshold line */}
                    {stats.threshold > 0 && stats.threshold <= maxCount && (
                        <div style={{
                            position: 'absolute', left: 28, right: 0,
                            height: 0,
                            bottom: `${(stats.threshold / maxCount) * 100 + 24}px`,
                            borderTop: '2px dashed rgba(220,38,38,0.4)',
                            zIndex: 2,
                        }}>
                            <span style={{
                                position: 'absolute', right: 0, top: -14,
                                fontSize: 8, fontWeight: 700, color: '#dc2626',
                                background: 'white', padding: '0 4px', borderRadius: 3,
                            }}>Threshold: {stats.threshold}</span>
                        </div>
                    )}

                    {/* Bars */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, paddingLeft: 28, paddingBottom: 24 }}>
                        {chartData.map((d, i) => {
                            const height = (d.count / maxCount) * 100;
                            const isPeak = d.count === stats.peak && d.count > 0;
                            return (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    <div style={{
                                        width: '100%', maxWidth: 24,
                                        height: `${Math.max(4, height)}%`,
                                        background: isPeak ? 'linear-gradient(180deg, #F37021, #f59e0b)' : 'linear-gradient(180deg, #390955, #5a1f80)',
                                        borderRadius: '3px 3px 0 0',
                                        transition: 'height 0.3s ease',
                                        position: 'relative',
                                    }}>
                                        {/* Tooltip on hover */}
                                        <div style={{
                                            position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
                                            fontSize: 9, fontWeight: 700, color: isPeak ? '#F37021' : '#390955',
                                            whiteSpace: 'nowrap',
                                        }}>{d.count}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* X-axis labels */}
                    <div style={{ display: 'flex', gap: 2, paddingLeft: 28 }}>
                        {chartData.map((d, i) => (
                            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                                <span style={{ fontSize: 8, color: '#a890c0', transform: 'rotate(-45deg)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                                    {d.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(180deg, #390955, #5a1f80)' }} />
                    <span style={{ fontSize: 10, color: '#7b6d8d' }}>Normal</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(180deg, #F37021, #f59e0b)' }} />
                    <span style={{ fontSize: 10, color: '#7b6d8d' }}>Peak</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 0, borderTop: '2px dashed rgba(220,38,38,0.4)' }} />
                    <span style={{ fontSize: 10, color: '#7b6d8d' }}>Threshold ({stats.threshold})</span>
                </div>
            </div>
        </div>
    );
};

export default ConnectionHistoryChart;
