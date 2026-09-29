import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { ToastContext } from './toastContextDef';

/**
 * Simplified, clean floating toast notification system for the Web Admin portal.
 * Anchored in the top-right corner with a minimal, modern aesthetic.
 *
 * Usage:
 *   const toast = useToast();
 *   toast('Parcel updated successfully', 'success');
 *   toast('Unable to reach server. Please try again.', 'error', { ttl: 5000 });
 */
const VARIANT = {
  success: {
    Icon: CheckCircle2,
    iconColor: '#059669',
    iconBg: '#ecfdf5',
    accentBorder: '#10b981',
  },
  error: {
    Icon: XCircle,
    iconColor: '#dc2626',
    iconBg: '#fef2f2',
    accentBorder: '#ef4444',
  },
  info: {
    Icon: Info,
    iconColor: '#7c3aed',
    iconBg: '#f5f3ff',
    accentBorder: '#8b5cf6',
  },
};

let toastSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const push = useCallback((message, type = 'success', { ttl = 3500 } = {}) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    timersRef.current[id] = setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}

      {toasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 24,
            right: 28,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: 380,
            width: 'calc(100vw - 56px)',
            pointerEvents: 'none',
          }}
        >
          <style>{`
            @keyframes yto-toast-slide-down {
              from {
                opacity: 0;
                transform: translateY(-10px) scale(0.98);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
          `}</style>
          {toasts.map((t) => {
            const v = VARIANT[t.type] || VARIANT.success;
            const Icon = v.Icon;
            return (
              <div
                key={t.id}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: '#ffffff',
                  color: '#1e293b',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${v.accentBorder}`,
                  boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.03)',
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  animation: 'yto-toast-slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: v.iconBg,
                    color: v.iconColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                <span style={{ flex: 1, wordBreak: 'break-word', color: '#1e293b' }}>
                  {t.message}
                </span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'color 0.15s ease, background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}