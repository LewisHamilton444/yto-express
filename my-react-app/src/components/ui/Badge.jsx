import React from 'react';
import Tooltip from './Tooltip';

// Tailwind tone palette shared by CustomerList / ManageIssues / ActivityLog
// badges (account category, ticket status, role, evidence count, ...).
// Keeps every pill across the three views on the same shape/weight/size
// instead of each screen hand-rolling its own.
const TONE_CLASSES = {
  slate:  'bg-slate-100 text-slate-600 border-slate-200',
  green:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  red:    'bg-red-100 text-red-800 border-red-200',
  blue:   'bg-blue-100 text-blue-800 border-blue-200',
  amber:  'bg-amber-100 text-amber-800 border-amber-200',
  purple: 'bg-brand-purple-100 text-brand-purple border-brand-purple-200',
  orange: 'bg-orange-50 text-brand-orange border-orange-200',
};

export default function Badge({
  tone,
  icon: Icon,
  children,
  className = '',
  hint,
  style,
  uppercase = true,
}) {
  const resolvedTone = tone || (!style?.background ? 'slate' : null);
  const toneClass = resolvedTone ? (TONE_CLASSES[resolvedTone] || TONE_CLASSES.slate) : '';

  const pill = (
    <span
      style={style}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-0.5 text-[11px] font-bold ${uppercase ? 'uppercase tracking-wide' : 'tracking-normal'} ${toneClass} ${className}`}
    >
      {Icon && <Icon size={11} strokeWidth={2.5} />}
      {children}
    </span>
  );
  if (!hint) return pill;
  return (
    <Tooltip content={hint}>{pill}</Tooltip>
  );
}
