import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, parcelsApi } from './services/api';
import StatusBadge from './components/ui/StatusBadge';
import { useToast } from './components/ui/useToast';
import Modal from './components/ui/Modal';
import PageHeader from './components/ui/PageHeader';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
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

  const toast = useToast();
  const flash = useCallback((msg, type = 'success') => toast(msg, type === 'error' ? 'error' : 'success'), [toast]);

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await parcelsApi.list();
      setParcels(Array.isArray(data) ? data : []);
    } catch {
      flash('Failed to load parcels. Is the server running?', 'error');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

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

      <PageHeader
        title="Hub Parcel Receiving"
        subtitle="Mark parcels as Received at Hub or Returned to Hub"
        breadcrumb={['Dashboard', 'Shipments', 'Hub Receiving']}
      />

      <div style={{ padding: '24px 32px' }}>

        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e8e0f0', overflow: 'hidden' }}>
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

          <style>{`
            .hub-row:hover td { background: #faf7fd !important; }
            .hub-action { opacity: 0.85; transition: opacity 0.15s ease; }
            .hub-row:hover .hub-action { opacity: 1; }
          `}</style>
          <div className="custom-table-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Tracking #', 'Sender', 'Receiver', 'Item', 'Status', 'Action'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '12px 16px',
                        textAlign: h === 'Action' ? 'right' : 'left',
                        fontWeight: 600,
                        color: '#64748b',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                        ...(h === 'Tracking #' ? { position: 'sticky', left: 0, zIndex: 10, background: '#f8fafc', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' } : {})
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton rows={6} columns={6} />
                ) : filtered.length > 0 ? filtered.map((p) => {
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
                  <tr key={p._id} className="hub-row" style={{ background: 'white' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#390955', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8', position: 'sticky', left: 0, zIndex: 5, background: 'white', borderRight: '1px solid #f3f0f8', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}>{p.trackingNumber}</td>
                    <td style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.senderName}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.receiverName}</td>
                    <td style={{ padding: '12px 16px', color: '#666', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.item}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}><StatusBadge status={p.status} colorMap={HUB_STATUS_COLORS} /></td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8', textAlign: 'right' }}>
                      <div className="hub-action" style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={receivedDisabled}
                          onClick={() => markStatus(p, 'Received at Hub')}
                          title={alreadyReceived ? 'Already marked as received at hub' : 'Mark parcel as received at the hub'}
                          style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #a7f3d0', cursor: receivedDisabled ? 'not-allowed' : 'pointer', background: '#ecfdf5', color: '#065f46', fontSize: '11px', fontWeight: 600, opacity: receivedDisabled ? 0.45 : 1, transition: 'all 0.15s ease', whiteSpace: 'nowrap' }}
                        >
                          Received at Hub
                        </button>
                        <button
                          type="button"
                          disabled={returnedDisabled}
                          onClick={() => setConfirmReturn(p)}
                          title="Return parcel to the hub (requires confirmation)"
                          style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #fecaca', cursor: returnedDisabled ? 'not-allowed' : 'pointer', background: '#fef2f2', color: '#b91c1c', fontSize: '11px', fontWeight: 600, opacity: returnedDisabled ? 0.45 : 1, transition: 'all 0.15s ease', whiteSpace: 'nowrap' }}
                        >
                          Returned to Hub
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 16px' }}>
                      <EmptyState
                        title="No parcels found"
                        description="No parcels match the search query."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Return-to-Hub confirmation — reversal of an in-flow parcel */}
      {confirmReturn && (
        <Modal onBackdropClick={() => setConfirmReturn(null)} tint="rgba(26,6,40,0.55)" blur={false} maxWidth={400} padding={24} cardStyle={{ borderRadius: 12 }}>
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