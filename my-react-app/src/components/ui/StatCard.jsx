import React from 'react';

const TONE_CLASSES = {
  purple: 'text-brand-purple bg-brand-purple-100',
  orange: 'text-brand-orange bg-orange-50',
  blue:   'text-blue-700 bg-blue-50',
  green:  'text-emerald-700 bg-emerald-50',
  amber:  'text-amber-700 bg-amber-50',
  red:    'text-red-700 bg-red-50',
};

/**
 * Metric summary card — the "TOTAL CUSTOMERS / REAL ACCOUNTS / ..." style
 * tiles reused (with different icon/label/value/tone) across CustomerList,
 * ManageIssues, and ActivityLog's header rows.
 */
export default function StatCard({ icon: Icon, label, value, tone = 'purple', loading = false }) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.purple;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-purple-200 bg-white p-4 transition hover:shadow-md hover:shadow-brand-purple-100/60">
      {Icon && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={19} strokeWidth={2.25} />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-[11px] font-bold uppercase tracking-wide text-brand-muted">{label}</div>
        {loading ? (
          <div className="mt-1.5 h-6 w-14 animate-pulse rounded bg-brand-purple-100" />
        ) : (
          <div className={`mt-0.5 text-2xl font-extrabold leading-tight ${TONE_CLASSES[tone]?.split(' ')[0] || 'text-brand-purple'}`}>{value}</div>
        )}
      </div>
    </div>
  );
}
