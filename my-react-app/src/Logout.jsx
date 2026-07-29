import React, { useState, useEffect } from 'react';

export default function Logout({ setActivePage, onLogout }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleStay = () => {
    setActivePage('dashboard');
  };

  const handleLogout = () => {
    if (onLogout) onLogout();        // clears currentUser → shows login
    else setActivePage('dashboard'); // fallback
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '80vh',
      padding: '30px',
      background: '#f7f4fa',
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: '48px 40px',
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 4px 24px rgba(57,9,85,0.12)',
        border: '1px solid rgba(57,9,85,0.08)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
      }}>

        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, #390955, #7b3fa0)',
        }} />

        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(57,9,85,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          border: '2px solid rgba(57,9,85,0.12)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="1.8">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
          Signing Out
        </h1>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 8px', lineHeight: 1.6 }}>
          Are you sure you want to log out of{' '}
          <strong style={{ color: '#390955' }}>YTO Express</strong>?
        </p>
        <p style={{ fontSize: 12, color: '#bbb', margin: '0 0 28px' }}>
          Any unsaved changes will be lost.
        </p>

        <div style={{ height: 1, background: '#f0e8f8', margin: '0 0 28px' }} />

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={handleStay}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              background: 'white', color: '#390955',
              border: '2px solid #390955', fontWeight: 600,
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Stay Logged In
          </button>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10,
              background: '#390955', color: 'white',
              border: '2px solid #390955', fontWeight: 600,
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Yes, Log Out
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#ccc', margin: '24px 0 0', letterSpacing: '0.3px' }}>
          YTO Express — Logistics Management System
        </p>
      </div>
    </div>
  );
}