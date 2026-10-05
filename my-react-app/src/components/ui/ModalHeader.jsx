import React from 'react';
import { X } from 'lucide-react';
import './ModalHeader.css';

/**
 * Light header bar shared by every admin popup (2026-10-05): white surface,
 * dark title, muted subtitle, an optional tinted icon chip (`icon` component
 * or a ready `iconNode` element) and a quiet close button. `tone="danger"` or
 * `"warning"` tints the icon for destructive confirmations; `children` render
 * on the right (badges, status pills) before the close button.
 */
export default function ModalHeader({
  title,
  subtitle,
  icon: Icon,
  iconNode,
  tone = 'default',
  onClose,
  closeLabel = 'Close',
  closeDisabled = false,
  sticky = false,
  children,
}) {
  return (
    <div className={`mh${sticky ? ' mh--sticky' : ''}`}>
      {(Icon || iconNode) && (
        <span className={`mh-icon mh-icon--${tone}`} aria-hidden="true">
          {iconNode || <Icon size={18} />}
        </span>
      )}
      <div className="mh-text">
        <h3 className="mh-title">{title}</h3>
        {subtitle && <p className="mh-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="mh-extra">{children}</div>}
      {onClose && (
        <button type="button" className="mh-close" onClick={onClose} aria-label={closeLabel} disabled={closeDisabled}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
