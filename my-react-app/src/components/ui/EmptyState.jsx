import React from 'react';

/** Clean "nothing here yet" block for empty tables/lists, replacing bare text like "No customers found". */
export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-purple-200 bg-brand-purple-50/50 px-6 py-14 text-center ${className}`}>
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-purple-300 ring-1 ring-brand-purple-200">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
      <p className="text-sm font-bold text-brand-purple">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs font-medium text-brand-muted">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-brand-orange px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
