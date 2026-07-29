import React, { useState } from 'react';

const s = {
  overlay:     { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,6,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
  modal:       { background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', fontFamily: "'DM Sans', sans-serif" },
  header:      { background: '#390955', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0 },
  title:       { color: 'white', margin: 0, fontSize: '16px', fontWeight: 700 },
  subtitle:    { color: 'rgba(255,255,255,0.65)', margin: '2px 0 0', fontSize: '12px' },
  closeBtn:    { background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '22px', lineHeight: 1 },
  body:        { padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' },
  sectionTitle:{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 10px' },
  infoGrid:    { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  infoCard:    { display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 14px', background: '#faf7fd', borderRadius: '12px', border: '1px solid #e4d8f2' },
  infoLabel:   { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a890c0' },
  infoValue:   { fontSize: '14px', fontWeight: 700, color: '#390955', wordBreak: 'break-word' },
  docList:     { display: 'flex', flexDirection: 'column', gap: '8px' },
  docRow:      { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#faf7fd', border: '1px solid #e4d8f2', borderRadius: '10px', fontSize: '13px', color: '#390955', fontWeight: 600 },
  docIcon:     { fontSize: '16px' },
  actions:     { display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px', borderTop: '1px solid #f3edfb', marginTop: '4px' },
  btnDanger:   { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontFamily: 'inherit' },
  btnOutline:  { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
  btnPrimary:  { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(243,112,33,0.25)' },
  reasonBox:   { display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '12px' },
  reasonLabel: { fontSize: '11px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  reasonInput: { padding: '10px 12px', border: '1.5px solid #fca5a5', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', minHeight: '60px', color: '#7f1d1d' },
  reasonActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
};

const ReviewModal = ({ item, type, onClose, onApprove, onReject }) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  if (!item) return null;

  const handleClose = () => { setRejecting(false); setReason(''); onClose(); };
  const confirmReject = () => {
    onReject(item, reason.trim());
    setRejecting(false);
    setReason('');
  };

  return (
    <div style={s.overlay} onClick={handleClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div>
            <h3 style={s.title}>Review {type === 'rider' ? 'Rider' : 'Seller'} Application</h3>
            <p style={s.subtitle}>{item.id} · Submitted via mobile app</p>
          </div>
          <button style={s.closeBtn} onClick={handleClose}>&times;</button>
        </div>

        <div style={s.body}>
          <div>
            <p style={s.sectionTitle}>Applicant Details</p>
            <div style={s.infoGrid}>
              <div style={s.infoCard}>
                <span style={s.infoLabel}>Full Name</span>
                <span style={s.infoValue}>{item.fullName}</span>
              </div>
              <div style={s.infoCard}>
                <span style={s.infoLabel}>Contact Number</span>
                <span style={s.infoValue}>{item.contactNumber}</span>
              </div>
              <div style={s.infoCard}>
                <span style={s.infoLabel}>Email</span>
                <span style={s.infoValue}>{item.email}</span>
              </div>
              <div style={s.infoCard}>
                <span style={s.infoLabel}>Government ID</span>
                <span style={s.infoValue}>{item.governmentId.type} — {item.governmentId.number}</span>
              </div>
              <div style={{ ...s.infoCard, gridColumn: 'span 2' }}>
                <span style={s.infoLabel}>Address</span>
                <span style={s.infoValue}>{item.address}</span>
              </div>

              {type === 'seller' && (
                <>
                  <div style={s.infoCard}>
                    <span style={s.infoLabel}>Business Name</span>
                    <span style={s.infoValue}>{item.businessName}</span>
                  </div>
                  <div style={s.infoCard}>
                    <span style={s.infoLabel}>Business Type</span>
                    <span style={s.infoValue}>{item.businessType}</span>
                  </div>
                </>
              )}

              {type === 'rider' && (
                <>
                  <div style={s.infoCard}>
                    <span style={s.infoLabel}>Vehicle Type</span>
                    <span style={s.infoValue}>{item.vehicle.type}</span>
                  </div>
                  <div style={s.infoCard}>
                    <span style={s.infoLabel}>Plate Number</span>
                    <span style={s.infoValue}>{item.vehicle.plate}</span>
                  </div>
                  <div style={{ ...s.infoCard, gridColumn: 'span 2' }}>
                    <span style={s.infoLabel}>Vehicle Model</span>
                    <span style={s.infoValue}>{item.vehicle.model}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <p style={s.sectionTitle}>Submitted Documents</p>
            <div style={s.docList}>
              {item.documents.map((doc) => (
                <div key={doc.fileName} style={s.docRow}>
                  <span style={s.docIcon}>📄</span>
                  <span>{doc.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#a890c0', fontWeight: 500, fontFamily: "'DM Mono', monospace", fontSize: '12px' }}>{doc.fileName}</span>
                </div>
              ))}
            </div>
          </div>

          {rejecting && (
            <div style={s.reasonBox}>
              <span style={s.reasonLabel}>Reason for Rejection</span>
              <textarea
                style={s.reasonInput}
                value={reason}
                autoFocus
                placeholder="e.g. Government ID photo is blurry / does not match applicant name..."
                onChange={(e) => setReason(e.target.value)}
              />
              <div style={s.reasonActions}>
                <button style={s.btnOutline} onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
                <button style={s.btnDanger} disabled={!reason.trim()} onClick={confirmReject}>Confirm Rejection</button>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <button style={s.btnDanger} onClick={() => setRejecting(true)}>Reject</button>
            <button style={s.btnOutline} onClick={handleClose}>Close</button>
            <button style={s.btnPrimary} onClick={() => onApprove(item)}>Approve &amp; Send Credentials</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
