import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';

const EXPORT_OPTIONS = [
  {
    key: 'csv',
    label: 'Export as CSV',
    description: 'Standard comma-separated format',
    badge: 'CSV',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-600',
  },
  {
    key: 'excel',
    label: 'Export as Excel',
    description: 'Microsoft Excel spreadsheet (.xls)',
    badge: 'XLS',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    icon: FileSpreadsheet,
    iconColor: 'text-green-600',
  },
  {
    key: 'pdf',
    label: 'Export as PDF',
    description: 'Printable formatted report',
    badge: 'PDF',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: Printer,
    iconColor: 'text-rose-600',
  },
  {
    key: 'word',
    label: 'Export as Word',
    description: 'Microsoft Word document (.doc)',
    badge: 'DOC',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: FileText,
    iconColor: 'text-blue-600',
  },
];

export default function ExportDropdown({
  onExport,
  disabled = false,
  label = 'Export',
  align = 'right',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (formatKey) => {
    setIsOpen(false);
    if (typeof onExport === 'function') {
      onExport(formatKey);
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#f37021] text-white text-xs font-bold hover:brightness-105 active:scale-95 transition-all shadow-sm ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <Download size={13} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className={`absolute mt-1.5 w-64 bg-white border border-[#e4d8f2] rounded-xl shadow-lg py-1.5 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
        >
          <div className="px-3 py-1.5 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Export Options
            </span>
          </div>
          <div className="p-1 space-y-0.5">
            {EXPORT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSelect(opt.key)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left hover:bg-[#faf7fd] transition-colors group cursor-pointer"
                  role="menuitem"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-md bg-slate-50 group-hover:bg-white border border-slate-100 ${opt.iconColor}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 group-hover:text-[#390955] truncate">
                        {opt.label}
                      </div>
                      <div className="text-[10.5px] text-slate-400 truncate">
                        {opt.description}
                      </div>
                    </div>
                  </div>
                  <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded border shrink-0 ${opt.badgeClass}`}>
                    {opt.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
