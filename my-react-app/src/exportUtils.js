
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

export function exportToWord(rows, columns, filename, title = 'Export Report') {
  const headerHtml = columns.map(c => `<th style="background-color:#390955;color:#ffffff;padding:8px 10px;text-align:left;font-size:11px;border:1px solid #e2e8f0;">${escapeHtml(c.label)}</th>`).join('');
  const rowsHtml = rows.map((row, idx) =>
    `<tr style="background-color:${idx % 2 === 0 ? '#ffffff' : '#faf8ff'};">${columns.map(c => `<td style="padding:8px 10px;font-size:11px;border:1px solid #e2e8f0;color:#1e293b;">${escapeHtml(row[c.key])}</td>`).join('')}</tr>`
  ).join('');
  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #1e293b; }
      h1 { color: #390955; font-size: 18px; margin-bottom: 4px; }
      p { color: #64748b; font-size: 11px; margin-top: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p>Generated on ${new Date().toLocaleString('en-PH')} · ${rows.length} record(s)</p>
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
    </html>
  `;
  downloadBlob(html, `${filename}.doc`, 'application/msword');
}

export function exportToPDF(rows, columns, filename, title = 'Export Report') {
  const w = window.open('', '_blank');
  if (!w) return;
  const head = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((r, idx) => `<tr class="${idx % 2 === 0 ? 'even' : 'odd'}">${columns.map(c => `<td>${escapeHtml(r[c.key])}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 28px; color: #1e293b; }
    h1 { color: #390955; font-size: 18px; margin-bottom: 2px; font-weight: 700; }
    p { color: #64748b; font-size: 11px; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
    th { background: #390955; color: #ffffff; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; padding: 8px 10px; text-align: left; border: 1px solid #390955; }
    td { border: 1px solid #e2e8f0; padding: 7px 10px; color: #1e293b; }
    tr.even { background: #ffffff; }
    tr.odd { background: #faf8ff; }
    @media print {
      body { margin: 12px; }
      @page { size: landscape; margin: 12mm; }
    }
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p>Generated on ${new Date().toLocaleString('en-PH')} · Total Records: ${rows.length}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.print();</script>
  </body></html>`);
  w.document.close();
}
