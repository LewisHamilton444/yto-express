import React from 'react';

/**
 * Standardized Data Table Container & Subcomponents
 *
 * Provides a unified responsive scroll wrapper, modern subtle lavender-slate
 * header, consistent cell padding, smooth row hover, and border styling.
 */
export default function DataTable({ children, className = '', containerClassName = '' }) {
  return (
    <div className={`overflow-x-auto w-full custom-table-scroll ${containerClassName}`}>
      <table className={`w-full border-collapse text-left text-[13px] ${className}`}>
        {children}
      </table>
    </div>
  );
}

DataTable.Head = function DataTableHead({ children, className = '' }) {
  return (
    <thead className={`bg-[#f8f6fc] border-b border-[#e2e8f0] text-[#55436a] text-[11px] font-bold uppercase tracking-wider ${className}`}>
      {children}
    </thead>
  );
};

DataTable.Th = function DataTableTh({ children, className = '', style = {}, onClick, align = 'left', stickyLeft = false }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const stickyClass = stickyLeft ? 'sticky left-0 z-20 bg-[#f8f6fc] border-r border-[#e2e8f0] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]' : '';
  return (
    <th
      style={style}
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-3.5 font-bold tracking-wider text-[#55436a] select-none ${alignClass} ${stickyClass} ${className}`}
    >
      {children}
    </th>
  );
};

DataTable.Row = function DataTableRow({ children, className = '', style = {}, onClick, isSelected = false }) {
  return (
    <tr
      style={style}
      onClick={onClick}
      className={`group border-b border-[#f1ecf8] transition-colors ${
        isSelected ? 'bg-[#f5effb]' : 'hover:bg-[#faf7fd]'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  );
};

DataTable.Cell = function DataTableCell({ children, className = '', style = {}, colSpan, align = 'left', tabularNums = false, stickyLeft = false }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const numClass = tabularNums ? 'tabular-nums' : '';
  const stickyClass = stickyLeft ? 'sticky left-0 z-10 bg-white group-hover:bg-[#faf7fd] border-r border-[#f1ecf8] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]' : '';
  return (
    <td
      colSpan={colSpan}
      style={style}
      className={`px-4 py-3 text-[#1a1a1a] align-middle ${alignClass} ${numClass} ${stickyClass} ${className}`}
    >
      {children}
    </td>
  );
};
