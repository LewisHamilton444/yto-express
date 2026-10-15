import React from 'react';
import { LogOut } from 'lucide-react';
import Modal from './components/ui/Modal';
import ModalHeader from './components/ui/ModalHeader';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  staff: 'Operations Staff',
  hub_receiver: 'Hub Receiver',
};

function initials(email = '') {
  const local = String(email || '').split('@')[0].trim();
  if (!local) return 'YX';
  const parts = local.split(/[._\-\s]+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((p) => p.charAt(0).toUpperCase()).join('');
  return letters || local.charAt(0).toUpperCase();
}

// Confirm-group dialog (same family as Return-to-hub / Archive / Deactivate):
// session row, one-line caution, quiet + primary footer. Stay Logged In only
// closes the dialog, so the user keeps their place instead of landing on
// the Dashboard. Backdrop/Esc also close via the shared Modal shell.
export default function Logout({ currentUser, onCancel, onLogout }) {
  const roleLabel = currentUser ? ROLE_LABELS[currentUser.role] : null;

  return (
    <Modal onBackdropClick={onCancel} maxWidth={400} padding={0} cardStyle={{ overflow: 'hidden' }}>
      <ModalHeader
        title="Signing Out"
        subtitle="Are you sure you want to log out of YTO Express?"
        icon={LogOut}
        onClose={onCancel}
      />
      <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Active session user: avatar, email, role */}
        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f7f4fa', border: '1px solid #eee7f5', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#390955', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
              {initials(currentUser.email)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.email || ''}
              </span>
              {roleLabel && (
                <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, color: '#390955', background: '#efe6f7', borderRadius: 9999, padding: '2px 8px' }}>
                  {roleLabel}
                </span>
              )}
            </div>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Any unsaved changes will be lost.</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#390955', background: 'transparent', border: '1px solid #d9cbe8', borderRadius: 'var(--yto-radius-button, 8px)', cursor: 'pointer' }}
          >
            Stay Logged In
          </button>
          <button
            type="button"
            onClick={onLogout}
            style={{ padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#390955', border: '1px solid #390955', borderRadius: 'var(--yto-radius-button, 8px)', cursor: 'pointer' }}
          >
            Yes, Log Out
          </button>
        </div>
      </div>
    </Modal>
  );
}
