import React from 'react';

/**
 * Icon-badge + title + total-count line at the top of a content card —
 * mirrors ManageParcels.jsx's "Parcel List / X of Y records — ..." panel
 * header. All left-aligned; status breakdowns live in CardFooter instead.
 */
export default function CardSectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
      {Icon && <Icon size={16} className="text-slate-400 shrink-0" aria-hidden="true" />}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}
