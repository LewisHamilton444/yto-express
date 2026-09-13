import React, { useState, useEffect } from 'react';
import { apiFetch } from './services/api';
import PageHeader from './components/ui/PageHeader';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import ListSkeleton from './components/ui/ListSkeleton';
import useSSE from './services/useSSE';

const ROLE_TONE = {
  customer: { label: 'Customer', bg: '#e0f2fe', color: '#0369a1' },
  seller:   { label: 'Seller',   bg: '#fef3c7', color: '#b45309' },
  rider:    { label: 'Rider',    bg: '#dcfce7', color: '#15803d' },
  admin:    { label: 'Admin',    bg: '#f0eaf8', color: '#390955' },
};

const TYPE_LABELS = {
  order_update: 'Order Update',
  new_order: 'New Order',
  system_alert: 'System Alert',
  system: 'System',
};

export default function AppNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [, setLastUpdated] = useState('');

  // Per-browser unread tracking: ids seen by this admin session live in
  // localStorage, so the "new" highlight survives navigation but stays
  // personal (there is no multi-admin read-state backend yet).
  const readIdsKey = 'yto_app_notif_read_ids';
  const getReadIds = () => {
    try { return JSON.parse(localStorage.getItem(readIdsKey) || '[]'); } catch { return []; }
  };
  const markAllRead = () => {
    try {
      localStorage.setItem(readIdsKey, JSON.stringify(notifications.map(n => n._id)));
    } catch { /* localStorage unavailable: skip persistence */ }
    setReadIds(getReadIds());
  };
  const [readIds, setReadIds] = useState(getReadIds);
  const unreadCount = notifications.filter(n => !readIds.includes(n._id)).length;

  const fetchNotifications = async () => {
    try {
      const res = await apiFetch('/notifications?limit=200');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  // Real-time updates: a bridged app notification arrives as SSE
  // 'notification-synced' — refresh the feed the moment it lands.
  const { on } = useSSE();
  useEffect(() => {
    const unsub = on('notification-synced', () => fetchNotifications());
    return unsub;
  }, [on]);

  const filtered = notifications.filter(n =>
    (roleFilter === 'all' || n.role === roleFilter) &&
    (typeFilter === 'all' || n.type === typeFilter)
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const s = {
    filtersRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 },
    select: { padding: '8px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' },
    item: { background: 'white', border: '1px solid #e0d5f0', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' },
    itemUnread: { border: '1.5px solid #c4a8d8', background: '#fcfaff' },
    dot: { width: 8, height: 8, borderRadius: '50%', background: '#f37021', marginTop: 6, flexShrink: 0 },
    roleBadge: (role) => {
      const tone = ROLE_TONE[role] || ROLE_TONE.admin;
      return { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: tone.bg, color: tone.color };
    },
    empty: { textAlign: 'center', padding: '48px 20px', color: '#888', fontSize: 13 },
  };

  return (
    <div style={{ flex: 1, background: '#f9f7ff', overflowY: 'auto', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <PageHeader
        title="App Notifications"
        subtitle="Real events pushed from the mobile app — bookings, pickups, deliveries, POD uploads and issue tickets"
        breadcrumb={['Dashboard', 'Support', 'App Notifications']}
      />
      <div style={{ padding: '0 32px 24px' }}>
        <CardSectionHeader title="Notification Feed" />
        <div style={s.filtersRow}>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={s.select} aria-label="Filter by role">
            <option value="all">All Roles</option>
            <option value="customer">Customer</option>
            <option value="seller">Seller</option>
            <option value="rider">Rider</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={s.select} aria-label="Filter by type">
            <option value="all">All Types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={fetchNotifications} style={{ padding: '8px 14px', background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#390955', cursor: 'pointer' }}>
            Refresh
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ padding: '8px 14px', background: '#390955', border: '1.5px solid #390955', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
              Mark {unreadCount} as seen
            </button>
          )}
        </div>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            No app notifications yet. Events appear here the moment the mobile app books, picks up or delivers a parcel.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(n => {
              const unread = !readIds.includes(n._id);
              return (
                <div key={n._id} style={{ ...s.item, ...(unread ? s.itemUnread : {}) }}>
                  {unread && <div style={s.dot} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={s.roleBadge(n.role)}>{(ROLE_TONE[n.role] || ROLE_TONE.admin).label}</span>
                      <strong style={{ fontSize: 13, color: '#1a1a1a' }}>{n.title}</strong>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {TYPE_LABELS[n.type] || n.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#555' }}>{n.message}</div>
                    {n.relatedId && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4, fontFamily: 'monospace' }}>Ref: {n.relatedId}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#9b82b2', whiteSpace: 'nowrap' }}>{formatDate(n.createdAt)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <CardFooter resultsLabel={`${filtered.length} notification${filtered.length !== 1 ? 's' : ''}`} />
    </div>
  );
}
