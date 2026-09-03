import React, { useState } from 'react';
import SettingsArchiveView from './SettingsArchiveView';
import { FileText } from 'lucide-react';
import { useToast } from './components/ui/ToastContext';

export default function Settings({
  /* ── Archived tracking reports still come from AnalyticsDashboard; archived
     sellers/riders are fetched live by SettingsArchiveView from MongoDB ── */
  archivedReports = [],
  onRestoreReport = () => {},
}) {
  const [archiveCounts, setArchiveCounts] = useState({ sellers: 0, riders: 0 });
  const toast = useToast();

  const showNotification = (message, type = 'success') => toast(message, type === 'error' ? 'error' : 'success');

  const s = {
    wrapper:      { padding: '30px', background: '#f7f4fa', minHeight: '100vh' },
    header:       { marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid #e0d0f0' },
    h1:           { fontSize: 28, fontWeight: 700, color: '#1a1a1a', margin: 0 },
    subtitle:     { fontSize: 14, color: '#888', margin: '6px 0 0' },
    section:      { background: 'white', borderRadius: 12, padding: 28, marginBottom: 20, boxShadow: '0 1px 3px rgba(57,9,85,0.06)', border: '1px solid rgba(57,9,85,0.07)', position: 'relative', overflow: 'hidden' },
    sectionAccent:{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #390955, #7b3fa0)' },
    sectionH2:    { fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' },
    sectionP:     { fontSize: 12, color: '#999', margin: '0 0 20px' },
    btnRestore:   { padding: '7px 16px', background: '#390955', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    archivedBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#ede4f5', color: '#6d1a9c', border: '1px solid rgba(109,26,156,0.2)' },
    table:        { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th:           { padding: '11px 14px', background: 'linear-gradient(135deg,#390955,#5a1a80)', color: 'rgba(255,255,255,0.85)', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
    td:           { padding: '12px 14px', borderBottom: '1px solid #f3ecfa', color: '#333', verticalAlign: 'middle' },
    summaryCard:  (color) => ({ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 10, background: 'white', border: `1.5px solid ${color}22`, borderLeft: `4px solid ${color}` }),
    countBadge:   (color) => ({ width: 38, height: 38, borderRadius: '50%', background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }),
    emptyState:   { textAlign: 'center', padding: '36px 24px', color: '#bbb', fontSize: 13, background: '#fdfcfe', borderRadius: 10, border: '1.5px dashed #e0d0f0' },
  };

  return (
    <div style={s.wrapper}>

      <div style={s.header}>
        <h1 style={s.h1}>Settings</h1>
        <p style={s.subtitle}>Inspect and manage archived sellers, riders, and tracking reports</p>
      </div>

      {/* ══════════════════════════════════════════════
          ARCHIVED RECORDS — the sole view on this page
      ══════════════════════════════════════════════ */}
      <div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Archived Sellers',          count: archiveCounts.sellers,  color: '#390955' },
            { label: 'Archived Riders',           count: archiveCounts.riders,   color: '#7b3fa0' },
            { label: 'Archived Tracking Reports', count: archivedReports.length, color: '#fb923c' },
          ].map(item => (
            <div key={item.label} style={s.summaryCard(item.color)}>
              <div style={s.countBadge(item.color)}>{item.count}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{item.count === 0 ? 'None archived' : `${item.count} record${item.count > 1 ? 's' : ''} archived`}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Archived Sellers & Riders (live from MongoDB) ── */}
        <div style={s.section}>
          <div style={s.sectionAccent} />
          <h2 style={s.sectionH2}>Archive Manager</h2>
          <p style={s.sectionP}>Archive an active seller/rider, restore an archived one, or permanently delete a record. This is the only place archiving happens now.</p>
          <SettingsArchiveView onCountsChange={setArchiveCounts} />
        </div>

        {/* ── Archived Tracking Reports ── */}
        <div style={s.section}>
          <div style={s.sectionAccent} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h2 style={s.sectionH2}>Archived Tracking Reports</h2>
            <span style={s.archivedBadge}>{archivedReports.length} archived</span>
          </div>
          <p style={s.sectionP}>Restore a tracking report to make it available for download again.</p>
          {archivedReports.length === 0 ? (
            <div style={s.emptyState}><div style={{ fontSize: 28, marginBottom: 8, color: '#c4a8d8', display: 'flex' }}><FileText size={28} aria-hidden="true" /></div>No archived tracking reports at the moment.</div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #ede4f5' }}>
              <table style={s.table}>
                <thead><tr>{['Report ID','Tracking No.','Generated Date','File Type','Status','Action'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {archivedReports.map((report, idx) => (
                    <tr key={report.id} style={{ background: idx % 2 === 0 ? 'white' : '#fdfcfe' }}>
                      <td style={{ ...s.td, fontWeight: 700, color: '#390955' }}>{report.id}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{report.trackingNo}</td>
                      <td style={s.td}>{report.generatedDate}</td>
                      <td style={s.td}>{report.filetype}</td>
                      <td style={s.td}><span style={s.archivedBadge}>Archived</span></td>
                      <td style={s.td}>
                        <button style={s.btnRestore} onClick={() => { onRestoreReport(report.id); showNotification(`Report ${report.id} restored`); }}>↩ Restore</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
