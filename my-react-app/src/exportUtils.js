'use client';

// Shared CSV/Excel export for ledger tables. No extra dependency: CSV is a
// plain Blob download, and "Excel" is a real, valid trick Excel supports
// natively — an HTML <table> served with an .xls extension and the
// application/vnd.ms-excel MIME type opens directly as a worksheet.

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function escapeHtml(value) {
  const str = value == null ? '' : String(value);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// `columns`: [{ key: 'sellerId', label: 'Seller ID' }, ...]
// `rows`: array of plain objects — `columns[].key` is read directly off each row.
export function exportToCSV(rows, columns, filename) {
  const header = columns.map(c => escapeCsvCell(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => escapeCsvCell(row[c.key])).join(','));
  downloadBlob([header, ...lines].join('\r\n'), `${filename}.csv`, 'text/csv;charset=utf-8;');
}

export function exportToExcel(rows, columns, filename) {
  const headerHtml = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
  const rowsHtml = rows.map(row =>
    `<tr>${columns.map(c => `<td>${escapeHtml(row[c.key])}</td>`).join('')}</tr>`
  ).join('');
  const html = `
    <html><head><meta charset="UTF-8"></head>
    <body><table border="1"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></body>
    </html>
  `;
  downloadBlob(html, `${filename}.xls`, 'application/vnd.ms-excel');
}
