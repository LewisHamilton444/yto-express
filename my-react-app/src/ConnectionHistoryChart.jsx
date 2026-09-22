import React, { useState, useEffect, useMemo } from 'react';
import { parcelsApi } from './services/api';
import { barHeightPercent } from './utils/barHeight';
import { isDeliveredStatus } from './utils/parcelStatus';

const ConnectionHistoryChart = ({ parcels: propParcels }) => {
    const [fetchedParcels, setFetchedParcels] = useState([]);
    const [loading, setLoading] = useState(!propParcels);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    // Bookings vs delivered bars — the delivered series used to be computed
    // but visible only inside the hover tooltip. The toggle surfaces it.
    const [series, setSeries] = useState('bookings');

    useEffect(() => {
        if (!propParcels) {
            let active = true;
            parcelsApi.list()
                .then(data => {
                    if (active) setFetchedParcels(Array.isArray(data) ? data : []);
                })
                .catch(() => {
                    if (active) setFetchedParcels([]);
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
            return () => { active = false; };
        } else {
            setLoading(false);
        }
    }, [propParcels]);

    const activeParcels = propParcels !== undefined ? propParcels : fetchedParcels;

    // Build rolling 14-hour activity buckets from real parcel timestamps
    const { chartData, todayBooked, todayDelivered, peakCount, avgCount, deliveredPeak, deliveredAvg } = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const buckets = [];

        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 3600000);
            const hourLabel = String(d.getHours()).padStart(2, '0') + ':00';
            const dayKey = d.toISOString().slice(0, 10);
            const hourNum = d.getHours();

            const created = activeParcels.filter(p => {
                if (!p.createdAt) return false;
                const pd = new Date(p.createdAt);
                return !isNaN(pd) && pd.toISOString().slice(0, 10) === dayKey && pd.getHours() === hourNum;
            }).length;

            const delivered = activeParcels.filter(p => {
                const time = p.updatedAt || p.createdAt;
                if (!time || !isDeliveredStatus(p.status)) return false;
                const pd = new Date(time);
                return !isNaN(pd) && pd.toISOString().slice(0, 10) === dayKey && pd.getHours() === hourNum;
            }).length;

            buckets.push({
                label: hourLabel,
                count: created,
                delivered,
            });
        }

        const bookedToday = activeParcels.filter(p => p.createdAt && p.createdAt.slice(0, 10) === todayStr).length;
        const deliveredToday = activeParcels.filter(p => isDeliveredStatus(p.status) && (p.updatedAt || p.createdAt)?.slice(0, 10) === todayStr).length;

        const maxHourly = Math.max(...buckets.map(b => b.count), 0);
        const maxDeliveredHourly = Math.max(...buckets.map(b => b.delivered), 0);
        const totalInWindow = buckets.reduce((sum, b) => sum + b.count, 0);
        const activeHours = buckets.filter(b => b.count > 0).length || 1;
        const average = Math.round((totalInWindow / activeHours) * 10) / 10;
        const totalDeliveredWindow = buckets.reduce((sum, b) => sum + b.delivered, 0);
        const activeDeliveredHours = buckets.filter(b => b.delivered > 0).length || 1;
        const deliveredAverage = Math.round((totalDeliveredWindow / activeDeliveredHours) * 10) / 10;

        return {
            chartData: buckets,
            todayBooked: bookedToday,
            todayDelivered: deliveredToday,
            peakCount: maxHourly,
            avgCount: average,
            deliveredPeak: maxDeliveredHourly,
            deliveredAvg: deliveredAverage,
        };
    }, [activeParcels]);

    const showingDelivered = series === 'delivered';
    const seriesPeak = showingDelivered ? deliveredPeak : peakCount;
    const seriesAvg = showingDelivered ? deliveredAvg : avgCount;
    const seriesVal = (d) => (showingDelivered ? d.delivered : d.count);
    const maxCount = Math.max(seriesPeak, 1);
    const hasData = chartData.some(d => d.count > 0 || d.delivered > 0);

    if (loading) {
        return (
            <div className="ed-connection-history-card" style={{ padding: 20, textAlign: 'center', color: '#a890c0', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                Loading shipment activity...
            </div>
        );
    }

    return (
        <div className="ed-connection-history-card">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
                <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#390955', whiteSpace: 'nowrap' }}>Hourly Activity</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#8c7f9d', whiteSpace: 'nowrap' }}>Real-time parcel volume by hour</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ display: 'flex', border: '1px solid #e0d5f0', borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="Chart series">
                        {[
                            { key: 'bookings', label: 'Bookings' },
                            { key: 'delivered', label: 'Delivered' },
                        ].map(opt => (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => { setSeries(opt.key); setHoveredIndex(null); }}
                                aria-pressed={series === opt.key}
                                style={{
                                    padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                    border: 'none', background: series === opt.key ? '#390955' : 'white',
                                    color: series === opt.key ? 'white' : '#390955',
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                        {[
                            { label: 'Today', value: todayBooked, color: '#390955' },
                            { label: 'Delivered', value: todayDelivered, color: '#16a34a' },
                            { label: 'Peak/hr', value: seriesPeak, color: '#F37021' },
                        ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#8c7f9d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                        </div>
                    ))}
                    <button onClick={() => {
                        const headers = ['Hour', 'Bookings', 'Deliveries'];
                        const rows = chartData.map(d => [d.label, d.count, d.delivered]);
                        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `yto_hourly_shipments_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
                        URL.revokeObjectURL(url);
                    }} style={{ padding: '4px 9px', background: 'white', border: '1px solid #e0d5f0', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#390955', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                        Export
                    </button>
                </div>
            </div>

            {/* Chart */}
            {!hasData ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#c4b8d8', fontSize: 11, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4c8e8" strokeWidth="1.5" style={{ marginBottom: 6 }}>
                        <rect x="1" y="3" width="15" height="13" />
                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                        <circle cx="5.5" cy="18.5" r="2.5" />
                        <circle cx="18.5" cy="18.5" r="2.5" />
                    </svg>
                    <p style={{ margin: 0, fontWeight: 600 }}>No parcel activity in the last 14 hours</p>
                    <p style={{ margin: '3px 0 0', fontSize: 9.5 }}>Activity will populate automatically as parcels are booked or delivered</p>
                </div>
            ) : (
                <div style={{ position: 'relative', marginTop: 8 }}>
                    {/* Y-axis labels & grid lines container (height: 130px) */}
                    <div style={{ position: 'relative', height: 130 }}>
                        {/* Y-axis labels */}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4, pointerEvents: 'none' }}>
                            <span style={{ fontSize: 9, color: '#a890c0', lineHeight: 1 }}>{maxCount}</span>
                            <span style={{ fontSize: 9, color: '#a890c0', lineHeight: 1 }}>{Math.round(maxCount / 2)}</span>
                            <span style={{ fontSize: 9, color: '#a890c0', lineHeight: 1 }}>0</span>
                        </div>

                        {/* Grid lines */}
                        <div style={{ position: 'absolute', left: 28, right: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ borderBottom: '1px solid #f0eaf8', width: '100%' }} />
                            ))}
                        </div>

                        {/* Average line (if > 0) */}
                        {seriesAvg > 0 && seriesAvg <= maxCount && (
                            <div style={{
                                position: 'absolute', left: 28, right: 0,
                                height: 0,
                                bottom: `${(seriesAvg / maxCount) * 100}%`,
                                borderTop: '2px dashed rgba(243,112,33,0.4)',
                                zIndex: 3,
                                pointerEvents: 'none',
                            }}>
                                <span style={{
                                    position: 'absolute', right: 0, top: -13,
                                    fontSize: 8.5, fontWeight: 700, color: '#ea580c',
                                    background: 'white', padding: '0 4px', borderRadius: 3,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                }}>Avg: {seriesAvg}</span>
                            </div>
                        )}

                        {/* Bars container */}
                        <div style={{ position: 'absolute', left: 28, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                            {chartData.map((d, i) => {
                                const val = seriesVal(d);
                                const height = barHeightPercent(val, maxCount);
                                const isPeak = val === seriesPeak && val > 0;
                                const isHovered = hoveredIndex === i;

                                return (
                                    <div
                                        key={i}
                                        onMouseEnter={() => setHoveredIndex(i)}
                                        onMouseLeave={() => setHoveredIndex(null)}
                                        style={{
                                            flex: 1,
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'flex-end',
                                            position: 'relative',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {/* Hover Tooltip */}
                                        {isHovered && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: `calc(${height}% + 6px)`,
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                fontSize: 10,
                                                fontWeight: 800,
                                                color: 'white',
                                                background: isPeak ? '#F37021' : '#390955',
                                                padding: '2px 7px',
                                                borderRadius: 4,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                whiteSpace: 'nowrap',
                                                zIndex: 10,
                                                pointerEvents: 'none',
                                            }}>
                                                {d.count} booked · {d.delivered} delivered
                                            </div>
                                        )}

                                        {/* Bar */}
                                        <div style={{
                                            width: '100%',
                                            maxWidth: 20,
                                            height: `${height}%`,
                                            background: isPeak ? '#F37021' : showingDelivered ? '#16a34a' : isHovered ? '#521379' : '#390955',
                                            borderRadius: '3px 3px 0 0',
                                            transition: 'height 0.3s ease, background 0.15s ease',
                                            opacity: hoveredIndex !== null && !isHovered ? 0.6 : 1,
                                        }} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* X-axis labels — every second hour so 14 buckets fit a ~360px card */}
                    <div style={{ display: 'flex', gap: 4, paddingLeft: 28, marginTop: 8 }}>
                        {chartData.map((d, i) => (
                            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                                <span style={{
                                    fontSize: 8.5,
                                    color: hoveredIndex === i ? '#390955' : '#a890c0',
                                    fontWeight: hoveredIndex === i ? 700 : 500,
                                    transform: 'rotate(-40deg)',
                                    display: 'inline-block',
                                    whiteSpace: 'nowrap',
                                    transition: 'color 0.15s ease',
                                }}>
                                    {i % 2 === 0 ? d.label : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: showingDelivered ? '#16a34a' : '#390955' }} />
                    <span style={{ fontSize: 10, color: '#7b6d8d' }}>{showingDelivered ? 'Delivered' : 'Bookings'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#F37021' }} />
                    <span style={{ fontSize: 10, color: '#7b6d8d' }}>Peak Hour</span>
                </div>
                {seriesAvg > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 0, borderTop: '2px dashed rgba(243,112,33,0.4)' }} />
                        <span style={{ fontSize: 10, color: '#7b6d8d' }}>Hourly Avg ({seriesAvg})</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConnectionHistoryChart;
