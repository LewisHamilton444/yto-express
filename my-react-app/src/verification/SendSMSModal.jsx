import React, { useState } from 'react';

const s = {
  overlay:    { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,6,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '20px' },
  modal:      { background: 'white', borderRadius: '16px', width: '100%', maxWidth: '460px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', fontFamily: "'DM Sans', sans-serif" },
  header:     { background: '#390955', padding: '18px 24px' },
  title:      { color: 'white', margin: 0, fontSize: '16px', fontWeight: 700 },
  subtitle:   { color: 'rgba(255,255,255,0.65)', margin: '2px 0 0', fontSize: '12px' },
  body:       { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  row:        { display: 'flex', flexDirection: 'column', gap: '4px' },
  label:      { fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', letterSpacing: '0.6px' },
  value:      { fontSize: '14px', fontWeight: 700, color: '#390955' },
  credGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  credCard:   { display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 14px', background: '#f5effa', border: '1.5px dashed #a05bb0', borderRadius: '10px' },
  credValue:  { fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#390955', wordBreak: 'break-all' },
  input:      { padding: '10px 12px', border: '1.5px solid #e4d8f2', borderRadius: '10px', fontSize: '14px', fontWeight: 700, color: '#390955', fontFamily: 'inherit', outline: 'none' },
  smsPreview: { background: '#faf7fd', border: '1px solid #e4d8f2', borderRadius: '12px', padding: '14px 16px', fontSize: '13px', lineHeight: 1.5, color: '#390955', position: 'relative' },
  smsLabel:   { position: 'absolute', top: '-9px', left: '14px', background: 'white', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', letterSpacing: '0.6px' },
  actions:    { display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' },
  btnOutline: { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
  btnPrimary: { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(243,112,33,0.25)' },
  errorBox:   { display: 'flex', flexDirection: 'column', gap: '10px', background: '#fee2e2', color: '#991b1b', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600 },
  errorActions: { display: 'flex', gap: '8px' },
  btnCopy:    { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#991b1b', border: '1.5px solid #fca5a5', fontFamily: 'inherit' },
};

// Credentials go out via Gmail — the free channel that actually delivers.
// Real SMS to PH numbers needs a paid provider (Semaphore credits), so the
// SMS path stays dormant in the backend until that's affordable.
const SendSMSModal = ({ item, credentials, message, onCancel, onConfirm, sending, sendError }) => {
  const [targetEmail, setTargetEmail] = useState(item?.email || '');
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <h3 style={s.title}>Approve &amp; Email Credentials</h3>
          <p style={s.subtitle}>Confirm before emailing login details to {item.fullName}</p>
        </div>

        <div style={s.body}>
          <div style={s.row}>
            <span style={s.label}>Applicant Email (editable — use your own email to test)</span>
            <input
              style={s.input}
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="e.g. applicant@gmail.com"
              type="email"
            />
          </div>

          <div style={s.credGrid}>
            <div style={s.credCard}>
              <span style={s.label}>Username</span>
              <span style={s.credValue}>{credentials.username}</span>
            </div>
            <div style={s.credCard}>
              <span style={s.label}>Temp Password</span>
              <span style={s.credValue}>{credentials.password}</span>
            </div>
          </div>

          <div style={s.smsPreview}>
            <span style={s.smsLabel}>Message Preview</span>
            {message}
          </div>

          {sendError && (
            <div style={s.errorBox}>
              <span>{sendError}</span>
              <div style={s.errorActions}>
                <button style={s.btnCopy} onClick={handleCopyPassword}>
                  {copied ? '✓ Copied!' : '📋 Copy Temp Password'}
                </button>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <button style={s.btnOutline} onClick={onCancel} disabled={sending}>Cancel</button>
            <button
              style={{ ...s.btnPrimary, opacity: sending || !targetEmail.trim() ? 0.6 : 1, cursor: sending || !targetEmail.trim() ? 'not-allowed' : 'pointer' }}
              onClick={() => onConfirm({ targetEmail: targetEmail.trim() })}
              disabled={sending || !targetEmail.trim()}
            >
              {sending ? 'Sending…' : sendError ? '🔁 Resend Email' : 'Approve & Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SendSMSModal;
