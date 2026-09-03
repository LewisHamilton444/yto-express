import React from 'react';

/**
 * Bottom status-summary strip for a table/content card — mirrors
 * ManageParcels.jsx's footer (Delivered/In Transit/Pending pills).
 * `pills` is [{ label, value, tone }], tone matching Badge's palette.
 */
const TONE_CLASSES = {
  slate:  'bg-slate-100 text-slate-600',
  green:  'bg-emerald-100 text-emerald-800',
  red:    'bg-red-100 text-red-800',
  blue:   'bg-blue-100 text-blue-800',
  amber:  'bg-amber-100 text-amber-800',
  purple: 'bg-brand-purple-100 text-brand-purple',
};

export default function CardFooter({ resultsLabel, pills = [] }) {
  return (
    <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
      <span>{resultsLabel}</span>
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map(p => (
            <span key={p.label} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLASSES[p.tone] || TONE_CLASSES.slate}`}>
              {p.label}: {p.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
