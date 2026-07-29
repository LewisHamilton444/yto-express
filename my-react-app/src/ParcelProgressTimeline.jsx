'use client';
import React from 'react';

const STAGES = ['Picked Up', 'Arrived at Hub', 'In Transit', 'Out for Delivery', 'Delivered'];

// Keyword hints pulled from each stage's own event-log entries first (most
// accurate — real per-parcel history), falling back to the coarse `status`
// field when there's no matching event text.
const STAGE_KEYWORDS = [
  ['picked up', 'pickup'],
  ['arrived at hub', 'hub'],
  ['in transit', 'in-transit'],
  ['out for delivery'],
  ['delivered'],
];

function resolveStageIndex(parcel) {
  const status = String(parcel?.status || '').toLowerCase();
  if (['failed', 'returned', 'return to sender'].some(k => status.includes(k))) return -1; // exception path, not on the happy-path timeline

  const events = Array.isArray(parcel?.events) ? parcel.events : [];
  let highest = -1;
  events.forEach(ev => {
    const text = `${ev.event || ''} ${ev.status || ''}`.toLowerCase();
    STAGE_KEYWORDS.forEach((keywords, idx) => {
      if (keywords.some(k => text.includes(k))) highest = Math.max(highest, idx);
    });
  });
  if (highest >= 0) return highest;

  // Fall back to the coarse status field alone.
  if (status.includes('deliver')) return 4;
  if (status.includes('out for delivery')) return 3;
  if (status.includes('transit')) return 2;
  if (status.includes('hub')) return 1;
  if (status.includes('picked') || status.includes('pending')) return 0;
  return 0;
}

export default function ParcelProgressTimeline({ parcel }) {
  const stageIndex = resolveStageIndex(parcel);
  const isException = stageIndex === -1;

  if (isException) {
    return (
      <div style={{ padding: '12px 14px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, fontSize: 12.5, fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
        ⚠ {parcel?.status || 'Exception'} — this parcel left the standard delivery path.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', padding: '4px 2px' }}>
      {STAGES.map((label, i) => {
        const done = i <= stageIndex;
        const isCurrent = i === stageIndex;
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <div style={{
                width: isCurrent ? 22 : 18, height: isCurrent ? 22 : 18, borderRadius: '50%',
                background: done ? (isCurrent ? '#f37021' : '#390955') : 'white',
                border: `2px solid ${done ? (isCurrent ? '#f37021' : '#390955') : '#e0d5f0'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isCurrent ? '0 0 0 4px rgba(243,112,33,0.15)' : 'none',
                flexShrink: 0,
              }}>
                {done && !isCurrent && <span style={{ color: 'white', fontSize: 10, fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: isCurrent ? 800 : 600, color: done ? '#1a1a1a' : '#bbb', textAlign: 'center', lineHeight: 1.3, maxWidth: 74 }}>
                {label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < stageIndex ? '#390955' : '#e6dcf2', marginTop: 9, minWidth: 8 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
