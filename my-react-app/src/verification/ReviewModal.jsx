import React, { useState, useEffect, useRef } from 'react';
import Modal from '../components/ui/Modal';
import Tooltip from '../components/ui/Tooltip';
import { FileText, Smartphone, X, User, Store, Bike, Truck, ShieldCheck, XCircle, CheckCircle2 } from 'lucide-react';
import LedgerStatus from '../components/ui/LedgerStatus';
import './ReviewModal.css';

const clean = (v) => {
  const t = String(v ?? '').trim();
  return t === '—' || t === '-' ? '' : t;
};

const formatSubmitted = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};


const isImageFile = (fileName) => /\.(png|jpe?g|webp|gif|heic)$/i.test(fileName || '');

const ReviewModal = ({ item, type, onClose, onApprove, onReject }) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [zoomDoc, setZoomDoc] = useState(null);
  const rejectRef = useRef(null);

  // The reason box opens at the bottom of the scrolling body; bring it into
  // view so the reviewer sees where to type.
  useEffect(() => {
    if (rejecting && rejectRef.current) rejectRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [rejecting]);

  if (!item) return null;

  const handleClose = () => { setRejecting(false); setReason(''); onClose(); };
  const confirmReject = () => {
    onReject(item, reason.trim());
    setRejecting(false);
    setReason('');
  };

  const submitted = formatSubmitted(item.submittedAt);
  const TypeIcon = type === 'rider' ? Bike : Store;
  const field = (label, value, opts = {}) => {
    const v = clean(value);
    return (
      <div className={`rv-field${opts.wide ? ' is-wide' : ''}`}>
        <span className="rv-field-label">{label}</span>
        <span className={`rv-field-value${v ? '' : ' is-empty'}${opts.accent && v ? ' is-accent' : ''}${opts.mono && v ? ' is-mono' : ''}`}>
          {v || 'Not provided'}
        </span>
      </div>
    );
  };

  return (
    <>
    <Modal
      onBackdropClick={handleClose}
      blur={false}
      tint="rgba(14,4,24,0.55)"
      overlayStyle={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      maxWidth={600}
      padding={0}
      label={`Review ${type === 'rider' ? 'rider' : 'seller'} application`}
      cardStyle={{ background: 'transparent', boxShadow: 'none', overflow: 'visible', maxHeight: 'none', borderRadius: 20 }}
    >
      <div className="rv-card">
        <header className="rv-head">
          <span className="rv-head-icon" aria-hidden="true"><TypeIcon size={20} /></span>
          <div className="rv-head-text">
            <h3>Review {type === 'rider' ? 'Rider' : 'Seller'} Application</h3>
            <div className="rv-head-meta">
              <span className="rv-chip">{item.id}</span>
              <span>Submitted via mobile app{submitted ? ` · ${submitted}` : ''}</span>
            </div>
          </div>
          <LedgerStatus tone="pending">Pending review</LedgerStatus>
          <button type="button" className="rv-close" onClick={handleClose} aria-label="Close review">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="rv-body">
          <section className="rv-section" aria-labelledby="rv-applicant">
            <h4 id="rv-applicant"><User size={13} aria-hidden="true" /> Applicant Details</h4>
            <div className="rv-grid">
              {field('Full Name', item.fullName)}
              {field('Email Address', item.email)}
              {field('Phone Number', item.contactNumber || item.phone, { mono: true })}
              {type === 'rider' && field('Hub Address', item.address)}
            </div>
          </section>

          {type === 'seller' ? (
            <section className="rv-section" aria-labelledby="rv-store">
              <h4 id="rv-store"><Store size={13} aria-hidden="true" /> Store Details</h4>
              <div className="rv-grid">
                {field('Store Name', item.storeName || item.businessName, { accent: true, wide: true })}
                {field('Store Address', item.address, { wide: true })}
              </div>
            </section>
          ) : (
            <section className="rv-section" aria-labelledby="rv-vehicle">
              <h4 id="rv-vehicle"><Truck size={13} aria-hidden="true" /> Vehicle</h4>
              <div className="rv-grid">
                {field('Vehicle Type', item.vehicle?.type || 'Motorcycle')}
                {field('Plate Number', item.vehicle?.plate, { mono: true })}
              </div>
            </section>
          )}

          <section className="rv-section" aria-labelledby="rv-verify">
            <h4 id="rv-verify"><ShieldCheck size={13} aria-hidden="true" /> Verification Status &amp; Documents</h4>
            {item.documents && item.documents.length > 0 ? (
              <div className="rv-docs">
                {item.documents.map((doc) => {
                  const isImg = isImageFile(doc.fileName);
                  const src = doc.url || doc.dataUrl || '';
                  const canPreview = isImg && !!src;
                  const Tag = canPreview ? 'button' : 'div';
                  return (
                    <Tag
                      key={doc.fileName}
                      type={canPreview ? 'button' : undefined}
                      className={`rv-doc${canPreview ? ' is-clickable' : ''}`}
                      onClick={canPreview ? () => setZoomDoc(doc) : undefined}
                      title={canPreview ? 'Click to enlarge' : undefined}
                    >
                      {canPreview
                        ? <img src={src} alt={doc.label} className="rv-doc-thumb" />
                        : <span className="rv-doc-icon"><FileText size={18} aria-hidden="true" /></span>}
                      <span className="rv-doc-text">
                        <span className="rv-doc-label">{doc.label}</span>
                        <span className="rv-doc-file">{doc.fileName}</span>
                      </span>
                    </Tag>
                  );
                })}
              </div>
            ) : (
              <div className="rv-note">
                <Smartphone size={16} aria-hidden="true" />
                <span>Submitted directly from the mobile app. Phone &amp; email authenticated via OTP verification.</span>
              </div>
            )}
          </section>

          {rejecting && (
            <section ref={rejectRef} className="rv-reject" aria-labelledby="rv-reason">
              <label id="rv-reason" htmlFor="rv-reason-input">Reason for Rejection</label>
              <textarea
                id="rv-reason-input"
                value={reason}
                autoFocus
                maxLength={500}
                placeholder="e.g. Government ID photo is blurry / does not match applicant name..."
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="rv-reject-actions">
                <span className="rv-reject-count">{reason.length}/500</span>
                <button type="button" className="rv-btn is-ghost" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
                <button type="button" className="rv-btn is-danger" disabled={!reason.trim()} onClick={confirmReject}>Confirm Rejection</button>
              </div>
            </section>
          )}
        </div>

        <footer className="rv-foot">
          <Tooltip content="Decline this application — a reason is required">
            <button type="button" className="rv-btn is-danger" onClick={() => setRejecting(true)} disabled={rejecting}>
              <XCircle size={15} aria-hidden="true" /> Reject
            </button>
          </Tooltip>
          <span className="rv-foot-spacer" />
          <button type="button" className="rv-btn is-ghost" onClick={handleClose}>Close</button>
          <Tooltip content="Approve the registration and email login credentials to the applicant">
            <button type="button" className="rv-btn is-approve" onClick={() => onApprove(item)} disabled={rejecting}>
              <CheckCircle2 size={15} aria-hidden="true" /> Approve &amp; Send Credentials
            </button>
          </Tooltip>
        </footer>
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
