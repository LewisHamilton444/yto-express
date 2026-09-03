import React from 'react';

/** Shimmering placeholder cards for non-table lists (e.g. ActivityLog's timeline). */
export default function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-xl border border-brand-purple-100 bg-brand-purple-50/40 p-4" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-brand-purple-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-brand-purple-100" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-brand-purple-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
