import React from 'react';
import { PARCEL_STATUS_COLORS, STATUS_HINTS } from './statusColors';
import Badge from './Badge';

/**
 * A colored status pill delegating to the unified Badge component.
 * Defaults to the parcel-status palette — pass `colorMap` for a different
 * status vocabulary (seller/account status, hub-specific states, ...),
 * `fallback` for the color to use when `status` isn't a recognized key, and
 * `label` if the badge text should differ from the raw `status` value.
 */
export default function StatusBadge({
  status,
  label,
  colorMap = PARCEL_STATUS_COLORS,
  fallback = 'Pending',
  hint,
  className = '',
  uppercase = false,
}) {
  const c = colorMap[status] || colorMap[fallback] || { bg: '#f3f4f6', color: '#374151' };
  const hintText = hint || STATUS_HINTS[status];

  return (
    <Badge
      hint={hintText}
      uppercase={uppercase}
      className={className}
      style={{
        background: c.bg,
        color: c.color,
        borderColor: c.border || 'transparent',
      }}
    >
      {label ?? status}
    </Badge>
  );
}
