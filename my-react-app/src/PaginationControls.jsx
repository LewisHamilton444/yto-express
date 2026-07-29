'use client';
import React from 'react';

const s = {
  bar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16, paddingTop: 8 },
  left:     { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500, color: '#a890c0' },
  select:   { padding: '6px 10px', border: '1.5px solid #e4d8f2', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#390955', background: 'white', fontFamily: 'inherit', cursor: 'pointer' },
  btns:     { display: 'inline-flex', gap: 8, alignItems: 'center' },
  btn:      { padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageInfo: { fontSize: 12, color: '#888', fontWeight: 600, padding: '0 4px' },
};

// Reusable "rows per page + Showing X-Y of Z + Prev/Next" bar for ledger
// tables. Purely presentational — the caller owns currentPage/rowsPerPage
// state and slices its own data; this just renders controls and reports
// changes back up.
export default function PaginationControls({
  currentPage,
  totalRecords,
  rowsPerPage,
  rowsPerPageOptions = [10, 25, 50, 100],
  onPageChange,
  onRowsPerPageChange,
}) {
  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));
  const firstRow = totalRecords === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const lastRow = Math.min(currentPage * rowsPerPage, totalRecords);

  return (
    <div style={s.bar}>
      <div style={s.left}>
        <span>Rows per page</span>
        <select
          style={s.select}
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
        >
          {rowsPerPageOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>Showing {firstRow}-{lastRow} of {totalRecords}</span>
      </div>
      <div style={s.btns}>
        <button
          style={{ ...s.btn, ...(currentPage === 1 ? s.btnDisabled : {}) }}
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>
        <span style={s.pageInfo}>Page {currentPage} of {totalPages}</span>
        <button
          style={{ ...s.btn, ...(currentPage >= totalPages ? s.btnDisabled : {}) }}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
