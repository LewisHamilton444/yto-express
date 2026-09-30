// Shared ledger-page helpers. Modal shell for detail modals (Customer List, Seller
// Directory): a flex-column card capped at the viewport so the header, tabs
// and footer stay fixed while only .lp-modal-body scrolls, over a softly
// blurred backdrop. Pass to <Modal cardStyle overlayStyle blur={false}>.
export const LEDGER_MODAL_CARD = {
  borderRadius: 18,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'calc(100vh - 40px)',
  boxShadow: '0 30px 60px -20px rgba(26,6,40,0.55), 0 0 0 1px rgba(57,9,85,0.08)',
};

export const LEDGER_MODAL_OVERLAY = {
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
};

export const LEDGER_MODAL_TINT = 'rgba(26,6,40,0.5)';

/** "Liza Villanueva" → "LV"; used by ledger avatars. */
export function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Registration/account status → LedgerStatus tone. Accepts the canonical
 * enum (ACTIVE, PENDING_VERIFICATION, ...) and loose legacy values
 * ('Active', 'Pending', 'Verified').
 */
export function statusTone(status) {
  const v = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (v === 'ACTIVE' || v === 'VERIFIED' || v === 'APPROVED') return 'on';
  if (v === 'PENDING_VERIFICATION' || v === 'PENDING' || v === '') return 'pending';
  if (['INACTIVE', 'DEACTIVATED', 'SUSPENDED', 'ARCHIVED', 'REJECTED'].includes(v)) return 'off';
  return 'neutral';
}
