import React from 'react';
import { Search } from 'lucide-react';

/**
 * Standardized Filter & Search Bar
 *
 * Provides consistent spacing, aligned 38px inputs, search icons,
 * focus rings, and action slots.
 */
export default function FilterBar({ children, className = '' }) {
  return (
    <div className={`flex flex-row flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#f0eaf8] bg-white ${className}`}>
      {children}
    </div>
  );
}

FilterBar.Group = function FilterBarGroup({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {children}
    </div>
  );
};

FilterBar.Search = function FilterBarSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  width = 'w-64 sm:w-72',
  ...props
}) {
  return (
    <div className={`relative ${width} ${className}`}>
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-[38px] pl-9 pr-4 py-2 border border-[#cbd5e1] rounded-lg text-sm bg-white text-[#1a1a1a] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f37021]/20 focus:border-[#f37021] transition-all"
        {...props}
      />
    </div>
  );
};

FilterBar.Select = function FilterBarSelect({
  value,
  onChange,
  children,
  className = '',
  ...props
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`h-[38px] px-3 py-2 border border-[#cbd5e1] rounded-lg text-xs sm:text-sm bg-white cursor-pointer font-semibold text-[#390955] focus:outline-none focus:ring-2 focus:ring-[#390955]/15 focus:border-[#390955] transition-all [&>option]:font-medium [&>option]:text-slate-700 [&>option]:bg-white ${className}`}
      {...props}
    >
      {children}
    </select>
  );
};

FilterBar.Count = function FilterBarCount({ count, label = 'records', className = '' }) {
  return (
    <span className={`text-xs text-[#7b6d8d] font-medium whitespace-nowrap ${className}`}>
      {count} {label}
    </span>
  );
};

FilterBar.Actions = function FilterBarActions({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 shrink-0 ml-auto ${className}`}>
      {children}
    </div>
  );
};
