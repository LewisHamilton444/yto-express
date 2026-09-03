import React from 'react';
import { PARCEL_STATUS_COLORS, STATUS_HINTS } from './statusColors';
import Tooltip from './Tooltip';

/**
 * A colored status pill. Defaults to the parcel-status palette — pass
 * `colorMap` for a different status vocabulary (seller/account status,
 * hub-specific states, ...), `fallback` for the color to use when `status`
 * isn't a recognized key, and `label` if the badge text should differ from
 * the raw `status` value (e.g. a formatted display label).
 *
 * When the status has a known meaning in STATUS_HINTS (or an explicit `hint`
 * prop is given), the pill shows that meaning as a hover/keyboard tooltip.
 */
export default function StatusBadge({ status, label, colorMap = PARCEL_STATUS_COLORS, fallback = 'Pending', hint }) {
  const c = colorMap[status] || colorMap[fallback] || { bg: '#f3f4f6', color: '#374151' };
  const pill = (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {label ?? status}
    </span>
  );
  const hintText = hint || STATUS_HINTS[status];
  if (!hintText) return pill;
  return (
    <Tooltip content={hintText}>{pill}</Tooltip>
  );
}
