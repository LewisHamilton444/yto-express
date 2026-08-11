import React, { useState, useEffect } from 'react';

const API = 'https://yto-express.onrender.com/api/parcels';

const STATUS_COLORS = {
  'Received at Hub':  { bg: '#d1fae5', color: '#065f46' },
  'Returned to Hub':  { bg: '#fee2e2', color: '#991b1b' },
  'Delivered':        { bg: '#d1fae5', color: '#065f46' },
  'In Transit':       { bg: '#e0f2fe', color: '#075985' },
  'Out for Delivery': { bg: '#fef3c7', color: '#92400e' },
  'Picked Up':        { bg: '#ede9fe', color: '#4c1d95' },
  'Pending':          { bg: '#f3f4f6', color: '#374151' },
};

const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS['Pending'];
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: c.bg, color: c.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {status}
    </span>
  );
};

export default function HubParcelReceiving() {
  const [parcels,    setParcels]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg,   setErrorMsg]   = useState('');

  useEffect(() => {
    fetchParcels();
  }, []);

  const fetchParcels = async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      const data = await res.json();
      setParcels(data);
    } catch (err) {
      flash('Failed to load parcels. Is the server running?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const flash = (msg, type) => {
    if (type === 'success') { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); }
    else                    { setErrorMsg(msg);   setTimeout(() => setErrorMsg(''), 3000); }
  };

  const markStatus = async (parcel, status) => {
    setUpdatingId(parcel._id);
    try {
      const res = await fetch(`${API}/${parcel._id}`, {
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
    } catch (err) {
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
        {successMsg && (
          <div style={{ padding: '10px 16px', borderRadius: '8px', background: '#d1fae5', color: '#065f46', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div style={{ padding: '10px 16px', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
            {errorMsg}
          </div>
        )}

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
                ) : filtered.length > 0 ? filtered.map((p, idx) => (
                  <tr key={p._id} style={{ background: idx % 2 === 0 ? 'white' : '#faf9ff' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#390955', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.trackingNumber}</td>
                    <td style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.senderName}</td>
                    <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.receiverName}</td>
                    <td style={{ padding: '12px 16px', color: '#666', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.item}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={updatingId === p._id}
                          onClick={() => markStatus(p, 'Received at Hub')}
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: updatingId === p._id ? 'default' : 'pointer', background: '#065f46', color: 'white', fontSize: '11px', fontWeight: 700, opacity: updatingId === p._id ? 0.6 : 1 }}
                        >
                          Received at Hub
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === p._id}
                          onClick={() => markStatus(p, 'Returned to Hub')}
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: updatingId === p._id ? 'default' : 'pointer', background: '#991b1b', color: 'white', fontSize: '11px', fontWeight: 700, opacity: updatingId === p._id ? 0.6 : 1 }}
                        >
                          Returned to Hub
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>No parcels found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}