import React from 'react';

const s = {
  panel:        { background: 'white', border: '1px solid rgba(57,9,85,0.08)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(57,9,85,0.04)', overflow: 'hidden' },
  panelHeader:  { padding: '16px 24px', background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  panelHeading: { fontSize: '15px', fontWeight: 700, color: 'white', margin: 0 },
  panelBody:    { padding: '8px 24px 24px' },
  scroll:       { overflowX: 'auto', border: '1px solid #e4d8f2', borderRadius: '12px' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'white', background: '#390955', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  td:           { padding: '14px 16px', color: '#390955', borderBottom: '1px solid #f3edfb', verticalAlign: 'top' },
  badge:        { fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '100px', background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' },
  badgeVerified:{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '100px', background: '#d1fae5', color: '#065f46', whiteSpace: 'nowrap' },
  badgeReal:    { fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', textTransform: 'uppercase' },
  badgeDemo:    { fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db', textTransform: 'uppercase' },
  btnPrimary:   { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit' },
  emptyState:   { textAlign: 'center', padding: '48px', color: '#a890c0', fontWeight: 500 },
  sub:          { fontSize: '11.5px', color: '#a890c0', marginTop: '2px' },
};

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const PendingVerificationsTable = ({ type, items, onReview }) => {
  const label = type === 'rider' ? 'Rider' : 'Seller';

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <h2 style={s.panelHeading}>Pending {label} Registrations</h2>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
          {items.length} awaiting review
        </span>
      </div>

      <div style={s.panelBody}>
        <div style={s.scroll}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Applicant</th>
                <th style={s.th}>Category</th>
                <th style={s.th}>Email Address</th>
                <th style={s.th}>Phone Number</th>
                {type === 'seller' ? (
                  <th style={s.th}>Store Address</th>
                ) : (
                  <th style={s.th}>Vehicle Info</th>
                )}
                <th style={s.th}>Submitted</th>
                <th style={s.th}>Status</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...s.td, ...s.emptyState }}>
                    No pending {label.toLowerCase()} registrations. New mobile app submissions will appear here.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const isDemo = item.accountCategory === 'DEMO';
                  return (
                    <tr key={item.id || idx} style={{ background: idx % 2 === 0 ? 'white' : '#faf7fd' }}>
                      <td style={{ ...s.td, fontWeight: 700 }}>
                        {item.fullName}
                        <div style={s.sub}>{item.id}</div>
                      </td>
                      <td style={s.td}>
                        <span style={isDemo ? s.badgeDemo : s.badgeReal}>
                          {isDemo ? 'DEMO' : 'REAL'}
                        </span>
                      </td>
                      <td style={{ ...s.td, fontSize: '12px' }}>
                        {item.email || '—'}
                      </td>
                      <td style={{ ...s.td, fontSize: '12px' }}>
                        {item.contactNumber || item.phone || '—'}
                      </td>
                      <td style={s.td}>
                        {type === 'seller' ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#f37021' }}>{item.storeName || item.businessName || '—'}</div>
                            <div style={s.sub}>{item.address || '—'}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{item.vehicle?.type || 'Motorcycle'}</div>
                            <div style={s.sub}>{item.vehicle?.plate || '—'}</div>
                          </>
                        )}
                      </td>
                      <td style={s.td}>{formatDate(item.submittedAt)}</td>
                      <td style={s.td}>
                        <span style={item.status === 'Verified' || item.status === 'ACTIVE' || item.status === 'Active' ? s.badgeVerified : s.badge}>{item.status}</span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <button style={s.btnPrimary} onClick={() => onReview(item)}>Review</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PendingVerificationsTable;
