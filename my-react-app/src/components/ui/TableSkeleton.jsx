import React from 'react';

/** Shimmering placeholder rows for a <table>/<tbody>, shown while a fetch is in flight. */
export default function TableSkeleton({ rows = 6, columns = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className={r % 2 === 0 ? 'bg-white' : 'bg-brand-purple-50/40'}>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <div
                className="h-3.5 animate-pulse rounded bg-brand-purple-100"
                style={{ width: `${55 + ((r * 7 + c * 13) % 40)}%`, animationDelay: `${(r * columns + c) * 40}ms` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
