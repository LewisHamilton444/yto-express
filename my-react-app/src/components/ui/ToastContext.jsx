'use client';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

/**
 * One toast system for the whole admin portal. Previously every screen had
 * its own divergent feedback — bottom-right toasts (verification), full-width
 * strips that shifted layout (ProcessParcel, Tracking Info, Hub), inline
 * green/red banners inside modals (ViewSeller), an AlertBanner used as a
 * toast (ManageIssues). All of those now push here: a fixed bottom-right
 * stack, per-toast auto-dismiss + manual close, consistent iconography.
 *
 * Usage:
 *   const toast = useToast();
 *   toast('Parcel updated', 'success');   // default 3.5s
 *   toast('Server unreachable', 'error', { ttl: 6000 });
 */
const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

const VARIANT = {
  success: { Icon: CheckCircle2, bg: '#390955', fg: '#ffffff' },
  error:   { Icon: XCircle,      bg: '#991b1b', fg: '#ffffff' },
  info:    { Icon: Info,          bg: '#1e1e2f', fg: '#ffffff' },
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
            position: 'fixed', bottom: 28, right: 28, zIndex: 30000,
            display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380,
          }}
        >
          {toasts.map((t) => {
            const v = VARIANT[t.type] || VARIANT.success;
            const Icon = v.Icon;
            return (
              <div
                key={t.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  background: v.bg, color: v.fg, borderRadius: 12,
                  padding: '12px 12px 12px 14px', boxShadow: '0 10px 25px -5px rgba(57,9,85,0.3)',
                  fontSize: 13, fontWeight: 600, lineHeight: 1.45,
                  animation: 'yto-toast-in 0.2s ease-out',
                }}
              >
                <style>{`@keyframes yto-toast-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
                <Icon size={17} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  style={{
                    background: 'rgba(255,255,255,0.18)', border: 'none', color: 'inherit',
                    width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}
