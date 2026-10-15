import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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
 *
 * Accessibility: renders with `role="dialog"` semantics, traps Tab focus
 * inside the card, closes on Escape (when `onBackdropClick` is provided),
 * and returns focus to the previously-focused element on unmount.
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
  label,
}) {
  const cardRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // Latest-handler ref: callers pass inline onBackdropClick arrows (new
  // identity every render), so the mount effect below must NOT depend on it —
  // otherwise every keystroke re-runs the effect and its cleanup yanks focus
  // out of the field being typed in. The Esc branch reads via this ref.
  const onBackdropClickRef = useRef(onBackdropClick);
  onBackdropClickRef.current = onBackdropClick;

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const card = cardRef.current;

    // Focus the dialog itself on open (harmless for screen readers, keeps
    // keyboard navigation from falling behind the overlay).
    if (card) {
      card.setAttribute('tabindex', '-1');
      card.focus({ preventScroll: true });
    }

    const onKeyDown = (e) => {
      const backdropHandler = onBackdropClickRef.current;
      if (e.key === 'Escape' && backdropHandler) {
        e.stopPropagation();
        backdropHandler();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      // Trap focus inside the card.
      const focusables = Array.from(card.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (restoreFocusRef.current && typeof restoreFocusRef.current.focus === 'function') {
        restoreFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

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
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          background: 'white', borderRadius: 'var(--yto-radius-dialog, 10px)', padding, maxWidth, width: '90%',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          outline: 'none',
          ...cardStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
