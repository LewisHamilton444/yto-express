import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from './services/api';
import useSSE from './services/useSSE';
import Tooltip from './components/ui/Tooltip';

const s = {
  wrap:   { position: 'relative' },
  bellBtn: { position: 'relative', width: 38, height: 38, borderRadius: 10, border: '1.5px solid #ede4f5', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badge:  { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: '50%', background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid white' },
  dropdown: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, background: 'white', borderRadius: 12, boxShadow: '0 12px 32px rgba(57,9,85,0.18)', border: '1px solid #ede4f5', zIndex: 3000, maxHeight: 420, overflowY: 'auto' },
  header: { padding: '14px 16px', borderBottom: '1px solid #f3edfb', fontSize: 13, fontWeight: 800, color: '#1a1a1a' },
  groupLabel: { fontSize: 10, fontWeight: 800, color: '#a890c0', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 16px 4px' },
  row:    { display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f7f2fc' },
  dot:    (color) => ({ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }),
  rowTitle: { fontSize: 12.5, fontWeight: 700, color: '#1a1a1a' },
  rowSub: { fontSize: 11, color: '#9b82b2', marginTop: 2 },
  empty:  { padding: '24px 16px', textAlign: 'center', color: '#bbb', fontSize: 12.5 },
};

export default function NotificationBell({ pendingCount = 0, onNavigate }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // ── Real app notification feed (2026-09-11 parity) ──
  // Durable events bridged from the mobile app (bookings, pickups,
  // deliveries, POD uploads, issue tickets). No synthetic alerts are mixed
  // in — every row here originates from a real app/backend event.
  const [appNotifications, setAppNotifications] = useState([]);
  const fetchAppNotifications = async () => {
    try {
      const res = await apiFetch('/notifications?limit=10');
      if (!res.ok) return;
      const data = await res.json();
      setAppNotifications(Array.isArray(data) ? data : []);
    } catch { /* bell feed is best-effort: keep the last known list */ }
  };
  useEffect(() => { fetchAppNotifications(); }, []);
  const { on } = useSSE();
  useEffect(() => {
    const unsub = on('notification-synced', () => fetchAppNotifications());
    return unsub;
  }, [on]);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const totalCount = appNotifications.length + (pendingCount > 0 ? 1 : 0);

  return (
    <div style={s.wrap} ref={wrapRef}>
      <Tooltip content={totalCount > 0 ? `Notifications — ${totalCount} unread alert${totalCount !== 1 ? 's' : ''} & pending registration${pendingCount !== 1 ? 's' : ''}` : 'Notifications — no active alerts' }>
        <button style={s.bellBtn} onClick={() => setOpen(v => !v)} aria-label="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {totalCount > 0 && <span style={s.badge}>{totalCount > 9 ? '9+' : totalCount}</span>}
        </button>
      </Tooltip>

      {open && (
        <div style={s.dropdown}>
          <div style={s.header}>Notifications</div>

          {pendingCount > 0 && (
            <>
              <div style={s.groupLabel}>Pending Registrations</div>
              <div style={{ ...s.row, cursor: 'pointer' }} onClick={() => { setOpen(false); onNavigate?.('process-seller'); }}>
                <span style={s.dot('#f37021')} />
                <div>
                  <div style={s.rowTitle}>{pendingCount} application{pendingCount !== 1 ? 's' : ''} awaiting review</div>
                  <div style={s.rowSub}>Sellers & riders submitted via mobile app</div>
                </div>
              </div>
            </>
          )}

          {appNotifications.length > 0 && (
            <>
              <div style={s.groupLabel}>From the Mobile App</div>
              {appNotifications.map(n => (
                <div key={n._id} style={{ ...s.row, cursor: 'pointer' }} onClick={() => { setOpen(false); onNavigate?.('app-notifications'); }}>
                  <span style={s.dot('#390955')} />
                  <div>
                    <div style={s.rowTitle}>{n.title}</div>
                    <div style={s.rowSub}>{n.message}{n.relatedId ? ` · ${n.relatedId}` : ''}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {totalCount === 0 && <div style={s.empty}>No notifications yet.</div>}
        </div>
      )}
    </div>
  );
}
