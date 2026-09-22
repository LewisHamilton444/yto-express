import React, { Fragment } from 'react';

/**
 * Top header card — title / subtitle / breadcrumb, in its own white rounded
 * card at the top of the page. Shared by CustomerList / ManageIssues /
 * ActivityLog so the three views stay pixel-identical instead of each
 * hand-rolling its own copy.
 *
 * `breadcrumb` is a plain array of labels, e.g. ['Dashboard', 'Customer
 * Management', 'Customer List'].
 */
export default function PageHeader({ title, subtitle, breadcrumb = [], actions, children }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-slate-100 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        {breadcrumb.length > 0 && (
          <nav className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 font-medium" aria-label="Breadcrumb">
            {breadcrumb.map((label, i) => (
              <Fragment key={label}>
                {i > 0 && <span>/</span>}
                <span>{label}</span>
              </Fragment>
            ))}
          </nav>
        )}
      </div>
      {(actions || children) && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {actions || children}
        </div>
      )}
    </div>
  );
}
