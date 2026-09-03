import React from 'react';
import { FlaskConical } from 'lucide-react';
import Tooltip from './Tooltip';

/**
 * Honest-label pill for any widget showing simulated/demo telemetry (GPS
 * drift, battery %, presence, sample geofence zones, sample alerts, ...).
 * Per the design system's trust rule, a screen must never present fabricated
 * data as live — this badge makes the distinction visible at a glance.
 * `text` defaults to a compact label; pass `full` for the longer form when
 * there is room next to the widget.
 */
export default function SimulatedFeedBadge({ text = 'Simulated feed', full = false, className = '' }) {
  const pill = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-700 ${className}`}
    >
      <FlaskConical size={10} strokeWidth={2.75} />
      {text}
    </span>
  );
  return (
    <Tooltip content={full
      ? 'This data is simulated for demonstration and is not backed by a live telemetry feed.'
      : 'Simulated for demonstration — not backed by live telemetry.'}
    >
      {pill}
    </Tooltip>
  );
}
