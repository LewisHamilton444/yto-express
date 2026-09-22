import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Top Refresh Button — matching the AnalyticsDashboard header refresh button.
 * Uses 8px radius, white background, #390955 text, spinning state, and smooth transition.
 */
export default function RefreshButton({
  onClick,
  isRefreshing = false,
  disabled = false,
  className = '',
}) {
  const isBusy = isRefreshing || disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e0d5f0] rounded-lg text-[11px] font-bold text-[#390955] transition-all duration-150 ${
        isBusy ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-[#faf7fd] hover:border-[#cfbfe6] active:scale-95 shadow-2xs'
      } ${className}`}
    >
      <RefreshCw
        size={12}
        className={isRefreshing ? 'animate-spin' : ''}
        style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
        aria-hidden="true"
      />
      <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
    </button>
  );
}
