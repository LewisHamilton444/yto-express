'use client';
import React from 'react';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import AdminProfileDropdown from './AdminProfileDropdown';
import useSSE from './services/useSSE';
import Tooltip from './components/ui/Tooltip';

const s = {
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 24px', background: 'white', borderBottom: '1px solid rgba(57,9,85,0.08)', flexWrap: 'wrap' },
  right: { display: 'flex', alignItems: 'center', gap: 14 },
};

export default function GlobalHeader({ currentUser, riders, pendingCount, onNavigate, onNavigateSettings, onLogoutClick }) {
  const { connected: sseConnected, mode, retry } = useSSE();

  const modeConfig = {
    sse:     { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', dot: '#22c55e', label: 'Live' },
    polling: { bg: 'rgba(245,158,11,0.1)', color: '#d97706', dot: '#f59e0b', label: 'Polling' },
    offline: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', dot: '#ef4444', label: 'Offline' },
  };
  const mc = modeConfig[mode] || modeConfig.offline;

  return (
    <div style={s.bar}>
      <GlobalSearch onNavigate={onNavigate} />
      <div style={s.right}>
        {/* Realm Indicator (REAL vs DEMO Sandbox) */}
        <Tooltip content={currentUser?.isDemo ? 'Sandbox demo — synthetic data, no live writes' : 'Live realm — connected to production MongoDB'}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
          background: currentUser?.isDemo ? 'rgba(245,158,11,0.12)' : 'rgba(5,150,105,0.12)',
          borderRadius: 8, fontSize: 10, fontWeight: 800,
          color: currentUser?.isDemo ? '#b45309' : '#047857',
          border: `1px solid ${currentUser?.isDemo ? '#fde68a' : '#a7f3d0'}`,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: currentUser?.isDemo ? '#f59e0b' : '#10b981',
          }} />
          {currentUser?.isDemo ? 'Sandbox Demo' : 'Live Realm'}
        </div>
        </Tooltip>

        {/* SSE Real-time indicator */}
        <Tooltip content={mode === 'sse' ? 'Live realtime feed (SSE) — updates stream instantly' : mode === 'polling' ? 'Realtime feed degraded — polling for updates every few seconds' : 'Realtime feed disconnected — click Retry to reconnect'}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
          background: mc.bg, borderRadius: 8, fontSize: 10, fontWeight: 700, color: mc.color,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: mc.dot,
            animation: mode === 'sse' ? 'pulse 1.5s infinite' : 'none',
          }} />
          {mc.label}
          {mode !== 'sse' && (
            <button onClick={retry} style={{
              marginLeft: 4, padding: '1px 6px', background: 'white', border: `1px solid ${mc.color}`,
              borderRadius: 4, fontSize: 9, fontWeight: 700, color: mc.color, cursor: 'pointer',
            }}>Retry</button>
          )}
        </div>
        </Tooltip>
        <NotificationBell riders={riders} pendingCount={pendingCount} onNavigate={onNavigate} />
        <AdminProfileDropdown currentUser={currentUser} onNavigateSettings={onNavigateSettings} onLogout={onLogoutClick} />
      </div>
    </div>
  );
}
