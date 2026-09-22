import React from 'react';

/**
 * Standardized Metric / Stat Summary Card
 */
export default function StatCard({
  label,
  value,
  sub,
  trend,
  trendTone = 'positive',
  icon: Icon,
  accent = false,
  tone = 'purple',
  className = '',
  onClick,
}) {
  const toneClasses = {
    purple: 'text-[#390955] bg-[#faf7fd] border-[#ede4f5]',
    orange: 'text-[#f37021] bg-[#fff9f5] border-[#fde8d7]',
    emerald: 'text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]',
    blue: 'text-[#2563eb] bg-[#eff6ff] border-[#bfdbfe]',
  };

  const trendToneClasses = {
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    negative: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-[#e8e0f0] p-5 shadow-[0_2px_8px_rgba(57,9,85,0.04)] flex flex-col justify-between transition-all ${
        accent ? 'border-t-2 border-t-[#390955]' : ''
      } ${
        onClick ? 'cursor-pointer hover:border-[#cbd5e1]' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#7b6d8d]">
          {label}
        </span>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${toneClasses[tone] || toneClasses.purple}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2.5 my-1">
        <span className="text-2xl sm:text-3xl font-extrabold text-[#1a1a1a] tracking-tight tabular-nums">
          {value}
        </span>
        {trend && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${trendToneClasses[trendTone] || trendToneClasses.neutral}`}>
            {trend}
          </span>
        )}
      </div>

      {sub && (
        <p className="text-xs text-[#888888] font-medium mt-1 truncate">
          {sub}
        </p>
      )}
    </div>
  );
}

StatCard.Grid = function StatCardGrid({ children, cols = 4, className = '' }) {
  const colClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[cols] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid ${colClass} gap-4 mb-6 ${className}`}>
      {children}
    </div>
  );
};
