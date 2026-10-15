import React, { useState, useEffect, useRef } from 'react';
import Modal from '../components/ui/Modal';
import Tooltip from '../components/ui/Tooltip';
import { FileText, X, Store, Bike, ShieldCheck, XCircle, CheckCircle2 } from 'lucide-react';
import { LEDGER_MODAL_CARD, LEDGER_MODAL_OVERLAY, LEDGER_MODAL_TINT, initialsOf } from '../ledger';
import '../LedgerPage.css';
import LedgerStatus from '../components/ui/LedgerStatus';
import { extractLocationFromAddress } from '../sellerRiderData';
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

  const raw = item.raw || {};
  const isRider = type === 'rider';
  const submitted = formatSubmitted(item.submittedAt);
  const storeName = clean(item.storeName || raw.storeName);
  const pick = (...vals) => vals.map(clean).find(Boolean) || '';

  const vehicleTypeVal = pick(item.vehicleType, raw.vehicleType, raw.vehicleModel, item.vehicle?.type);
  const plateVal = pick(item.plateNumber, raw.vehiclePlate, raw.vehiclePlateNumber, item.vehicle?.plate);

  const fullAddress = pick(
    item.address,
    raw.warehouseAddress,
    raw.address?.street,
    typeof raw.address === 'string' ? raw.address : '',
    raw.assignedHub
  );
  const loc = extractLocationFromAddress(fullAddress);

  // Same grouped layout as the Seller Directory "View Details" modal.
  const groups = [
    {
      title: 'Identification & Credentials',
      rows: [
        { label: 'ID Type', value: pick(item.governmentId?.type, raw.idType) || (isRider ? "Driver's License" : '') },
        { label: isRider ? "Driver's License No." : 'Government ID / Permit No.', value: pick(item.governmentId?.number, raw.idNumber, raw.licenseNumber, raw.governmentIdNumber, raw.driverLicenseNumber) },
        ...(isRider ? [{ label: 'Employment Classification', value: (raw.riderType || item.raw?.riderType || item.riderType) === 'COMPANY' ? 'Company Fleet Rider' : 'Partner Rider' }] : []),
      ],
    },
    {
      title: 'Contact Point',
      rows: [
        { label: 'Email', value: pick(item.email, raw.email), wrap: true },
        { label: 'Phone', value: pick(item.contactNumber, item.phone, raw.phone) },
      ],
    },
    {
      title: isRider ? 'Hub / Service Address' : 'Address',
      rows: [
        { label: 'Street', value: fullAddress, wrap: true },
        { label: 'City', value: pick(raw.city, raw.address?.city, loc.city) },
        { label: 'State / Province', value: pick(raw.state, raw.province, raw.address?.state, loc.province) },
        { label: 'Postal Code', value: pick(raw.postalCode, raw.address?.postalCode, loc.postalCode) },
        { label: 'Country', value: pick(raw.country, raw.address?.country, loc.country) },
      ],
    },
    isRider
      ? {
          title: 'Vehicle',
          rows: [
            { label: 'Vehicle Type', value: vehicleTypeVal },
            { label: 'Plate Number', value: plateVal },
          ],
        }
      : {
          title: 'Store & Operations',
          rows: [
            { label: 'Store Name', value: storeName },
            { label: 'Warehouse Address', value: pick(raw.warehouseAddress, fullAddress), wrap: true },
            { label: 'Operating Hours', value: pick(raw.operatingHours) },
            { label: 'Registration Date', value: submitted },
          ],
        },
  ];

  return (
    <>
    <Modal
      onBackdropClick={handleClose}
      blur={false}
      tint={LEDGER_MODAL_TINT}
      overlayStyle={LEDGER_MODAL_OVERLAY}
      maxWidth={580}
      padding={0}
      label={`Review ${isRider ? 'rider' : 'seller'} application`}
      cardStyle={LEDGER_MODAL_CARD}
    >
      <div className="lp-modal-head">
        <span className="lp-modal-avatar" aria-hidden="true">{initialsOf(item.fullName)}</span>
        <div className="lp-modal-identity">
          <h3>{clean(item.fullName) || 'Applicant'}</h3>
          {!isRider && storeName && <div className="lp-modal-store">{storeName}</div>}
          <div className="lp-modal-meta">
            <span className="lp-modal-id">{item.id}</span>
            <LedgerStatus tone="pending">Pending Review</LedgerStatus>
          </div>
        </div>
        <button type="button" className="lp-modal-close" onClick={handleClose} aria-label="Close review">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="rv-banner">
        {isRider ? <Bike size={15} aria-hidden="true" /> : <Store size={15} aria-hidden="true" />}
        <span>
          <strong>Review {isRider ? 'Rider' : 'Seller'} Application</strong>
          {submitted ? ` · ${submitted}` : ''}
        </span>
      </div>

      <div className="lp-modal-body">
        <div className="lp-detail-groups">
          {groups.map((group) => (
            <section key={group.title} className="lp-detail-group" aria-label={group.title}>
              <h4>{group.title}</h4>
              <dl>
                {group.rows.map((row) => {
                  const empty = !clean(row.value);
                  return (
                    <div key={row.label} className="lp-detail-row">
                      <dt>{row.label}</dt>
                      <dd className={`${row.wrap ? 'is-wrap' : ''}${empty ? ' is-empty' : ''}`}>{empty ? 'Not provided' : row.value}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}

          <section className="lp-detail-group" aria-label="Verification and documents">
            <h4>Verification &amp; Documents</h4>
            {item.documents && item.documents.length > 0 ? (
              <div className="rv-docs">
                {item.documents.map((doc, idx) => {
                  const src = doc.url || doc.dataUrl || '';
                  const label = doc.label || doc.name || `Document #${idx + 1}`;
                  const fileName = doc.fileName || (src ? src.split('/').pop().split('?')[0] : '') || label;
                  const canPreview = Boolean(src);
                  const Tag = canPreview ? 'button' : 'div';
                  return (
                    <Tag
                      key={doc.fileName || doc.name || doc.url || idx}
                      type={canPreview ? 'button' : undefined}
                      className={`rv-doc${canPreview ? ' is-clickable' : ''}`}
                      onClick={canPreview ? () => setZoomDoc({ ...doc, label, fileName, src }) : undefined}
                      title={canPreview ? 'Click to enlarge document' : undefined}
                    >
                      {canPreview && src
                        ? <img src={src} alt={label} className="rv-doc-thumb" />
                        : <span className="rv-doc-icon"><FileText size={18} aria-hidden="true" /></span>}
                      <span className="rv-doc-text">
                        <span className="rv-doc-label">{label}</span>
                        <span className="rv-doc-file">{fileName}</span>
                      </span>
                    </Tag>
                  );
                })}
              </div>
            ) : (
              <div className="rv-note">
                <FileText size={16} aria-hidden="true" />
                <span>No supporting documents uploaded for this application.</span>
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
                <button type="button" className="lp-btn is-secondary" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
                <button type="button" className="lp-btn is-danger" disabled={!reason.trim()} onClick={confirmReject}>Confirm Rejection</button>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="lp-modal-foot rv-foot">
        <Tooltip content="Decline this application — a reason is required">
          <button type="button" className="lp-btn is-danger" onClick={() => setRejecting(true)} disabled={rejecting}>
            <XCircle size={14} aria-hidden="true" /> Reject
          </button>
        </Tooltip>
        <span className="rv-foot-spacer" />
        <button type="button" className="lp-btn is-secondary" onClick={handleClose}>Close</button>
        <Tooltip content="Approve the registration and email login credentials to the applicant">
          <button type="button" className="lp-btn is-approve" onClick={() => onApprove(item)} disabled={rejecting}>
            <CheckCircle2 size={14} aria-hidden="true" /> Approve &amp; Send Credentials
          </button>
        </Tooltip>
      </div>
    </Modal>

      {/* Zoomed document preview — fixed overlay, rendered outside the modal card */}
      {zoomDoc && (
        <div
          onClick={() => setZoomDoc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,2,16,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: 24 }}
          role="dialog"
          aria-modal="true"
          aria-label={zoomDoc.label || zoomDoc.name || 'Document'}
        >
          <button
            onClick={() => setZoomDoc(null)}
            aria-label="Close document preview"
            style={{ position: 'absolute', top: 18, right: 22, width: '30px', height: '30px', borderRadius: 'var(--yto-radius-button, 8px)', background: 'none', border: 'none', color: 'white', fontSize: 28, lineHeight: 1, cursor: 'pointer' }}
          >
            &times;
          </button>
          <div style={{ maxWidth: '92vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img
              src={zoomDoc.src || zoomDoc.url || zoomDoc.dataUrl}
              alt={zoomDoc.label || zoomDoc.name || 'Document'}
              style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 10, boxShadow: '0 24px 70px rgba(0,0,0,0.55)', objectFit: 'contain', background: 'white' }}
            />
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>{zoomDoc.label || zoomDoc.name || 'Document'} {zoomDoc.fileName ? `— ${zoomDoc.fileName}` : ''}</div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReviewModal;
