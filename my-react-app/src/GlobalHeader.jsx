'use client';
import React from 'react';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import AdminProfileDropdown from './AdminProfileDropdown';

const s = {
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 24px', background: 'white', borderBottom: '1px solid rgba(57,9,85,0.08)', flexWrap: 'wrap' },
  right: { display: 'flex', alignItems: 'center', gap: 14 },
};

// Persistent top bar shown above whichever page is active — an addition
// layered over the existing sidebar/page layout, not a replacement for it.
export default function GlobalHeader({ currentUser, riders, pendingCount, onNavigate, onNavigateSettings, onLogoutClick }) {
  return (
    <div style={s.bar}>
      <GlobalSearch onNavigate={onNavigate} />
      <div style={s.right}>
        <NotificationBell riders={riders} pendingCount={pendingCount} onNavigate={onNavigate} />
        <AdminProfileDropdown currentUser={currentUser} onNavigateSettings={onNavigateSettings} onLogout={onLogoutClick} />
      </div>
    </div>
  );
}
