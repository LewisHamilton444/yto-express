import React from 'react';

/**
 * Icon-badge + title + total-count line at the top of a content card —
 * mirrors ManageParcels.jsx's "Parcel List / X of Y records — ..." panel
 * header. All left-aligned; status breakdowns live in CardFooter instead.
 */
export default function CardSectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
      {Icon && (
        <span className="bg-orange-500 p-2 rounded-lg text-white flex items-center justify-center shrink-0">
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}
