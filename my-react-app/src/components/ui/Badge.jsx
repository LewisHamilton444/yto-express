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

export default function Badge({ tone = 'slate', icon: Icon, children, className = '', hint }) {
  const pill = (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TONE_CLASSES[tone] || TONE_CLASSES.slate} ${className}`}
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
