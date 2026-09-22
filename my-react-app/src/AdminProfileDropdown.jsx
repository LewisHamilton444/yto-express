import React, { useEffect, useRef, useState } from 'react';

const ROLE_LABELS = { super_admin: 'Super Admin', staff: 'Staff', hub_receiver: 'Hub Receiver' };

const s = {
  wrap:     { position: 'relative' },
  trigger:  { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 },
  avatar:   { width: 34, height: 34, borderRadius: '50%', background: '#390955', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 },
  nameCol:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  name:     { fontSize: 12.5, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 },
  role:     { fontSize: 10.5, color: '#a890c0', fontWeight: 600 },
  dropdown: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 220, background: 'white', borderRadius: 14, boxShadow: '0 12px 32px rgba(57,9,85,0.18)', border: '1px solid #ede4f5', zIndex: 3000, overflow: 'hidden' },
  head:     { padding: '14px 16px', borderBottom: '1px solid #f3edfb', display: 'flex', alignItems: 'center', gap: 10 },
  item:     { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', fontSize: 13, fontWeight: 600, color: '#390955', cursor: 'pointer' },
  itemDanger: { color: '#991b1b' },
};

export default function AdminProfileDropdown({ currentUser, onNavigateSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const name = currentUser?.name || 'Admin';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[currentUser?.role] || currentUser?.role || 'User';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  return (
    <div style={s.wrap} ref={wrapRef}>
      <button style={s.trigger} onClick={() => setOpen(v => !v)}>
        <div style={s.avatar}>{initials}</div>
        <div style={s.nameCol}>
          <span style={s.name}>{name}</span>
          <span style={s.role}>{roleLabel}</span>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a890c0" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div style={s.dropdown}>
          <div style={s.head}>
            <div style={s.avatar}>{initials}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>{name}</div>
              <div style={{ fontSize: 11, color: '#a890c0' }}>{roleLabel}</div>
            </div>
          </div>
          {isSuperAdmin && (
            <div style={s.item} onClick={() => { setOpen(false); onNavigateSettings?.(); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              Archives
            </div>
          )}
          <div style={{ ...s.item, ...s.itemDanger }} onClick={() => { setOpen(false); onLogout?.(); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </div>
        </div>
      )}
    </div>
  );
}
