import React, { useState } from 'react';
import Modal from '../components/ui/Modal';
import Tooltip from '../components/ui/Tooltip';
import { FileText } from 'lucide-react';

const s = {
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
  docIcon:     { display: 'flex', alignItems: 'center', color: '#9b82b2', flexShrink: 0 },
  actions:     { display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px', borderTop: '1px solid #f3edfb', marginTop: '4px' },
  btnDanger:   { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontFamily: 'inherit' },
  btnOutline:  { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
  btnPrimary:  { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(243,112,33,0.25)' },
  reasonBox:   { display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '12px' },
  reasonLabel: { fontSize: '11px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  reasonInput: { padding: '10px 12px', border: '1.5px solid #fca5a5', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', minHeight: '60px', color: '#7f1d1d' },
  reasonActions: { display: 'flex', gap: '8px', justifyContent: 'flex-end' },
};

const isImageFile = (fileName) => /\.(png|jpe?g|webp|gif|heic)$/i.test(fileName || '');

const ReviewModal = ({ item, type, onClose, onApprove, onReject }) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [zoomDoc, setZoomDoc] = useState(null);

  if (!item) return null;

  const handleClose = () => { setRejecting(false); setReason(''); onClose(); };
  const confirmReject = () => {
    onReject(item, reason.trim());
    setRejecting(false);
    setReason('');
  };

  return (
    <>
    <Modal onBackdropClick={handleClose} blur={false} tint="rgba(26,6,40,0.5)" maxWidth={560} padding={0} cardStyle={{ borderRadius: 16, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', fontFamily: "'DM Sans', sans-serif" }}>
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
              {item.documents.map((doc) => {
                const isImg = isImageFile(doc.fileName);
                const src = doc.url || doc.dataUrl || '';
                const canPreview = isImg && !!src;
                return (
                  <div
                    key={doc.fileName}
                    style={{ ...s.docRow, alignItems: canPreview ? 'center' : 'flex-start', cursor: canPreview ? 'pointer' : 'default' }}
                    onClick={canPreview ? () => setZoomDoc(doc) : undefined}
                    title={canPreview ? 'Click to enlarge' : undefined}
                  >
                    {canPreview ? (
                      <img
                        src={src}
                        alt={doc.label}
                        style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', border: '1px solid #e4d8f2', flexShrink: 0 }}
                      />
                    ) : (
                      <span style={s.docIcon}><FileText size={20} aria-hidden="true" /></span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#390955', fontWeight: 600 }}>{doc.label}</div>
                      <div style={{ color: '#a890c0', fontWeight: 500, fontFamily: "'DM Mono', monospace", fontSize: '11px', marginTop: 2 }}>{doc.fileName}</div>
                      {isImg && !canPreview && (
                        <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 3 }}>
                          Preview unavailable — the image was not uploaded with this registration.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
            <Tooltip content="Decline this application — a reason is required">
            <button style={s.btnDanger} onClick={() => setRejecting(true)}>Reject</button>
            </Tooltip>
            <button style={s.btnOutline} onClick={handleClose}>Close</button>
            <Tooltip content="Approve the registration and email login credentials to the applicant">
            <button style={s.btnPrimary} onClick={() => onApprove(item)}>Approve &amp; Send Credentials</button>
            </Tooltip>
          </div>
        </div>
    </Modal>

      {/* Zoomed document preview — fixed overlay, rendered outside the modal card */}
      {zoomDoc && (
        <div
          onClick={() => setZoomDoc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,2,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 24 }}
          role="dialog"
          aria-modal="true"
          aria-label={zoomDoc.label}
        >
          <button
            onClick={() => setZoomDoc(null)}
            aria-label="Close document preview"
            style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: 'white', fontSize: 28, lineHeight: 1, cursor: 'pointer' }}
          >
            &times;
          </button>
          <div style={{ maxWidth: '92vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img
              src={zoomDoc.url || zoomDoc.dataUrl}
              alt={zoomDoc.label}
              style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 10, boxShadow: '0 24px 70px rgba(0,0,0,0.55)', objectFit: 'contain', background: 'white' }}
            />
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600 }}>{zoomDoc.label} — {zoomDoc.fileName}</div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReviewModal;
