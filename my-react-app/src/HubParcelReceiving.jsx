import React, { useState, useEffect } from 'react';
import { apiFetch, parcelsApi } from './services/api';
import StatusBadge from './components/ui/StatusBadge';
import { useToast } from './components/ui/ToastContext';
import Modal from './components/ui/Modal';
import { PARCEL_STATUS_COLORS } from './components/ui/statusColors';

// Hub receiving adds two statuses on top of the shared parcel-status
// vocabulary — this is the only screen that ever sets them.
const HUB_STATUS_COLORS = {
  ...PARCEL_STATUS_COLORS,
  'Received at Hub': { bg: '#d1fae5', color: '#065f46' },
  'Returned to Hub':  { bg: '#fee2e2', color: '#991b1b' },
};

export default function HubParcelReceiving() {
  const [parcels,    setParcels]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [confirmReturn, setConfirmReturn] = useState(null);

  useEffect(() => {
    fetchParcels();
  }, []);

  const fetchParcels = async () => {
    setLoading(true);
    try {
      const data = await parcelsApi.list();
      setParcels(Array.isArray(data) ? data : []);
    } catch {
      flash('Failed to load parcels. Is the server running?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toast = useToast();
  const flash = (msg, type = 'success') => toast(msg, type === 'error' ? 'error' : 'success');

  const markStatus = async (parcel, status) => {
    setUpdatingId(parcel._id);
    try {
      const res = await apiFetch(`/parcels/${parcel._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          events: [...(parcel.events || []), { time: new Date().toISOString(), event: status, location: 'Hub', status }],
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = await res.json();
      setParcels(prev => prev.map(p => (p._id === updated._id ? updated : p)));
      flash(`Marked ${parcel.trackingNumber} as "${status}".`, 'success');
    } catch {
      flash('Failed to update parcel status.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = parcels.filter(p =>
    p.trackingNumber?.toLowerCase().includes(search.toLowerCase()) ||
    p.senderName?.toLowerCase().includes(search.toLowerCase()) ||
    p.receiverName?.toLowerCase().includes(search.toLowerCase()) ||
    p.status?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f9f7ff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      <header style={{ background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px', margin: '0 0 4px 0' }}>
          Manage Parcels
        </h1>
        <p style={{ fontSize: '13px', color: '#666', margin: '2px 0 0 0' }}>
          Mark parcels as Received at Hub or Returned to Hub
        </p>
      </header>

      <div style={{ padding: '24px 32px' }}>

        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e8e0f0', boxShadow: '0 2px 8px rgba(57,9,85,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1.5px solid #f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{filtered.length} of {parcels.length} parcels</p>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                type="text"
                placeholder="Search parcels..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '8px 12px', border: '1.5px solid #e0d5f0', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', color: '#1a1a1a', outline: 'none', width: '220px', background: '#faf9ff' }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#390955' }}>
                  {['Tracking #', 'Sender', 'Receiver', 'Item', 'Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'white', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Loading parcels…</td></tr>
                ) : filtered.length > 0 ? filtered.map((p, idx) => {
                  const st = String(p.status || '').toLowerCase();
                  const alreadyReceived = st === 'received at hub';
                  const alreadyReturned = st === 'returned' || st === 'returned to hub';
                  const terminal = st === 'delivered' || st === 'failed';
                  const busy = updatingId === p._id;
                  // Received only makes sense while a parcel is still on the
                  // way; Returned is a guarded (confirmed) reversal.
                  const receivedDisabled = busy || alreadyReceived || alreadyReturned || terminal;
                  const returnedDisabled  = busy || alreadyReturned;
                  return (
                  <tr key={p._id} style={{ background: idx % 2 === 0 ? 'white' : '#faf9ff' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#390955', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.trackingNumber}</td>
                    <td style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.senderName}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.receiverName}</td>
                    <td style={{ padding: '12px 16px', color: '#666', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.item}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}><StatusBadge status={p.status} colorMap={HUB_STATUS_COLORS} /></td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={receivedDisabled}
                          onClick={() => markStatus(p, 'Received at Hub')}
                          title={alreadyReceived ? 'Already marked as received at hub' : 'Mark parcel as received at the hub'}
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: receivedDisabled ? 'default' : 'pointer', background: '#065f46', color: 'white', fontSize: '11px', fontWeight: 700, opacity: receivedDisabled ? 0.45 : 1 }}
                        >
                          Received at Hub
                        </button>
                        <button
                          type="button"
                          disabled={returnedDisabled}
                          onClick={() => setConfirmReturn(p)}
                          title="Return parcel to the hub (requires confirmation)"
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: returnedDisabled ? 'default' : 'pointer', background: '#991b1b', color: 'white', fontSize: '11px', fontWeight: 700, opacity: returnedDisabled ? 0.45 : 1 }}
                        >
                          Returned to Hub
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No parcels found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Return-to-Hub confirmation — reversal of an in-flow parcel */}
      {confirmReturn && (
        <Modal onBackdropClick={() => setConfirmReturn(null)} tint="rgba(26,6,40,0.55)" blur={false} maxWidth={400} padding={24} cardStyle={{ borderRadius: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#991b1b' }}>Return parcel to hub?</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.6 }}>
            <strong>{confirmReturn.trackingNumber}</strong> ({confirmReturn.senderName} to {confirmReturn.receiverName}) will be
            marked as <strong>Returned to Hub</strong>. This updates the parcel status and notifies connected screens.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={() => setConfirmReturn(null)}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e0d5f0', background: 'white', color: '#390955', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { const p = confirmReturn; setConfirmReturn(null); markStatus(p, 'Returned to Hub'); }}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#991b1b', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Yes, Return to Hub
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}