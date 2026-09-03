import React from 'react';
import { AlertTriangle, Info, CheckCircle2, WifiOff, RefreshCw } from 'lucide-react';

const VARIANTS = {
  error:   { icon: WifiOff,      wrap: 'bg-red-50 border-red-200 text-red-800',       iconWrap: 'bg-red-100 text-red-600' },
  warning: { icon: AlertTriangle, wrap: 'bg-amber-50 border-amber-200 text-amber-800', iconWrap: 'bg-amber-100 text-amber-600' },
  info:    { icon: Info,          wrap: 'bg-brand-purple-50 border-brand-purple-200 text-brand-purple', iconWrap: 'bg-brand-purple-100 text-brand-purple' },
  success: { icon: CheckCircle2,  wrap: 'bg-emerald-50 border-emerald-200 text-emerald-800', iconWrap: 'bg-emerald-100 text-emerald-600' },
};

/**
 * Styled replacement for the raw "Failed to load... Make sure the backend
 * is running" text banners previously hard-coded in CustomerList /
 * ManageIssues / ActivityLog. `detail` is meant for the resolved API base
 * (see services/api.js) so an admin can see exactly which origin failed
 * to respond, and `onRetry` re-triggers the same fetch that failed.
 */
export default function AlertBanner({ variant = 'error', title, message, detail, onRetry, className = '' }) {
  const v = VARIANTS[variant] || VARIANTS.error;
  const Icon = v.icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${v.wrap} ${className}`} role="alert">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${v.iconWrap}`}>
        <Icon size={18} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">{title}</p>
        {message && <p className="mt-0.5 text-xs font-medium opacity-90">{message}</p>}
        {detail && <p className="mt-1 truncate font-mono text-[11px] opacity-70">{detail}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-bold shadow-sm ring-1 ring-inset ring-black/5 transition hover:bg-white active:scale-95"
        >
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}
