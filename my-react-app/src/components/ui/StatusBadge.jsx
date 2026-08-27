import React from 'react';
import { PARCEL_STATUS_COLORS } from './statusColors';

/**
 * A colored status pill. Defaults to the parcel-status palette — pass
 * `colorMap` for a different status vocabulary (seller/account status,
 * hub-specific states, ...), `fallback` for the color to use when `status`
 * isn't a recognized key, and `label` if the badge text should differ from
 * the raw `status` value (e.g. a formatted display label).
 */
export default function StatusBadge({ status, label, colorMap = PARCEL_STATUS_COLORS, fallback = 'Pending' }) {
  const c = colorMap[status] || colorMap[fallback] || { bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {label ?? status}
    </span>
  );
}
