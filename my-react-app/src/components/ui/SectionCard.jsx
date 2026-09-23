import React from 'react';

/**
 * Standardized Section Card Container
 * 
 * Provides uniform surface, 12px/14px rounded corners, subtle brand border,
 * soft elevation shadow, and optional integrated header/footer slots.
 */
export default function SectionCard({
  children,
  title,
  subtitle,
  icon: Icon,
  actions,
  header,
  footer,
  noPadding = false,
  className = '',
  bodyClassName = '',
  style = {},
  onClick,
}) {
  const hasHeader = header || title || subtitle || Icon || actions;

  return (
    <div
      onClick={onClick}
      style={style}
      className={`bg-white rounded-2xl border border-[#e8e0f0] shadow-[0_2px_10px_rgba(57,9,85,0.04)] overflow-hidden transition-all ${className}`}
    >
      {hasHeader && (
        header ? (
          header
        ) : (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#f0eaf8]">
            <div className="flex items-center gap-2.5 min-w-0">
              {Icon && (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#faf7fd] text-[#390955] shrink-0 border border-[#ede4f5]">
                  <Icon size={16} aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                {title && <h2 className="text-sm font-bold text-[#1a1a1a] truncate">{title}</h2>}
                {subtitle && <p className="text-xs text-[#7b6d8d] truncate mt-0.5">{subtitle}</p>}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        )
      )}

      <div className={`${noPadding ? '' : 'p-6'} ${bodyClassName}`.trim()}>
        {children}
      </div>

      {footer && (
        <div className="border-t border-[#f0eaf8]">
          {footer}
        </div>
      )}
    </div>
  );
}
