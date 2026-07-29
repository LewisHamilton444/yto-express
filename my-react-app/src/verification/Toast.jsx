import React from 'react';

const styles = {
  wrapper: {
    position: 'fixed',
    bottom: '28px',
    right: '28px',
    zIndex: 3000,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  toast: {
    minWidth: '280px',
    maxWidth: '360px',
    padding: '14px 18px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    fontWeight: 600,
    boxShadow: '0 10px 25px -5px rgba(57,9,85,0.25)',
    animation: 'yto-toast-in 0.2s ease-out',
  },
  success: { background: '#390955', color: 'white', border: '1px solid #57157a' },
  error:   { background: '#fdf2f2', color: '#9b1c1c', border: '1px solid #fecaca' },
  icon:    { fontSize: '16px', lineHeight: 1 },
};

const Toast = ({ toasts }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <style>{`@keyframes yto-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {toasts.map((t) => (
        <div key={t.id} style={{ ...styles.toast, ...(t.type === 'error' ? styles.error : styles.success) }}>
          <span style={styles.icon}>{t.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};

export default Toast;
