import React from 'react';

/**
 * Centered overlay + card shell — the "fixed, dark backdrop behind a
 * centered white rounded card" wrapper that was hand-rolled slightly
 * differently in about a dozen places across the app (SettingsArchiveView,
 * ManageAccounts, ViewSeller, ManageParcels, ManageParcelLocation,
 * GenerateRiderDataReport, GenerateParcelConfirmationStatus, ...) — same
 * shape every time, but each with its own copy of the positioning/backdrop
 * CSS and small drifts in z-index, tint, and blur.
 *
 * Only the shell is shared; each caller still owns its own header/body/
 * footer content via `children`. `onBackdropClick` is left undefined by
 * default (clicking outside does nothing) since several screens
 * deliberately don't close on backdrop click mid-edit — pass it explicitly
 * where a screen wants that behavior.
 */
export default function Modal({
  children,
  onBackdropClick,
  maxWidth = 420,
  tint = 'rgba(20,5,35,0.55)',
  blur = true,
  zIndex = 2000,
  padding = 28,
  overlayStyle,
  cardStyle,
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: tint,
        ...(blur ? { backdropFilter: 'blur(3px)' } : null),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex, padding: 20,
        ...overlayStyle,
      }}
      onClick={onBackdropClick}
    >
      <div
        style={{
          background: 'white', borderRadius: 12, padding, maxWidth, width: '90%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          ...cardStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
