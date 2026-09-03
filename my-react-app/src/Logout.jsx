import React, { useState, useEffect } from 'react';
import './Logout.css';

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

export default function Logout({ setActivePage, onLogout, currentUser }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const perform = (action) => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      if (action === 'stay') {
        if (setActivePage) setActivePage('dashboard');
      } else if (action === 'logout' && onLogout) {
        onLogout(); // clears currentUser -> shows login
      }
    }, 320);
  };

  const roleLabel = currentUser ? ROLE_LABELS[currentUser.role] : null;
  const isDemo = !!(currentUser && currentUser.isDemo);

  return (
    <div className="logout-root">
      <div className={`logout-card ${visible ? 'in' : ''} ${exiting ? 'exit' : ''}`}>
        <div className="logout-accent" />

        {/* Active session user: avatar, email, role/demo badge */}
        {currentUser && (
          <div className="logout-user">
            <div className="logout-avatar">{initials(currentUser.email)}</div>
            <div className="logout-user-meta">
              <span className="logout-user-email">{currentUser.email || ''}</span>
              {(isDemo || roleLabel) && (
                <span className={isDemo ? 'logout-user-demo' : 'logout-user-role'}>
                  {isDemo ? 'Demo' : roleLabel}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="logout-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="1.8">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>

        <h1 className="logout-title">Signing Out</h1>
        <p className="logout-desc">
          Are you sure you want to log out of{' '}
          <strong>YTO Express</strong>?
        </p>
        <p className="logout-sub">Any unsaved changes will be lost.</p>

        <div className="logout-divider" />

        <div className="logout-actions">
          <button type="button" className="logout-btn logout-btn--ghost" onClick={() => perform('stay')}>
            <svg width="14" height="14" viewBox="0 0 24 24
" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Stay Logged In
          </button>

          <button type="button" className="logout-btn logout-btn--primary" onClick={() => perform('logout')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Yes, Log Out
          </button>
        </div>

        <p className="logout-footer">YTO Express — Logistics Management System</p>
      </div>
    </div>
  );
}
