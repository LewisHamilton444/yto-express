import React from 'react';
import './PhotoAvatar.css';

/**
 * The app's profile photo when one was synced, otherwise the initials the
 * portal already showed (D-16).
 *
 * The photo arrives over the bridge from the rider/seller profile in the
 * Android app (Seller/Rider `profilePhotoUrl`) and is whatever the app stored —
 * an https URL or a data URL. It is optional on every record, so this falls
 * back to initials rather than rendering an empty circle, and the initials
 * branch is unchanged from before, which means a record without a photo looks
 * exactly as it always did.
 *
 * `className` keeps the caller's existing avatar class so sizing/border styling
 * (LedgerPage.css `.lp-avatar`, `.lp-modal-avatar`, ...) is untouched.
 */
export default function PhotoAvatar({ photo, name = '', className = '', style }) {
  const src = typeof photo === 'string' ? photo.trim() : '';
  const initials = (String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()) || '?';

  return (
    <span className={className} aria-hidden="true" style={style}>
      {src
        ? <img src={src} alt="" className="yto-avatar-img" />
        : initials}
    </span>
  );
}
