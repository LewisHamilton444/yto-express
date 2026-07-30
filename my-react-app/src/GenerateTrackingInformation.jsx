'use client';
import React, { useState, useEffect } from 'react';

const S = {
  wrap:    { display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f5f5f5', fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" },
  header:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 28px', background:'white', borderBottom:'1px solid #e5ddf0', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 8px rgba(57,9,85,0.06)' },
  title:   { fontSize:20, fontWeight:800, color:'#390955', margin:0, letterSpacing:-0.4 },
  tabs:    { background:'white', borderBottom:'1px solid #e5ddf0', display:'flex', overflowX:'auto', position:'sticky', top:66, zIndex:99 },
  content: { flex:1, padding:'24px 28px' },
  panel:   { background:'white', borderRadius:12, border:'1px solid #e5ddf0', padding:'28px', boxShadow:'0 1px 6px rgba(57,9,85,0.07)' },
  ph:      { fontSize:18, fontWeight:800, color:'#1a0a2e', margin:'0 0 6px' },
  ps:      { fontSize:13, color:'#9b82b2', margin:'0 0 24px' },
  fw:      { background:'#faf9ff', borderRadius:10, border:'1px solid #e5ddf0', padding:'22px' },
  fg:      { marginBottom:18 },
  fl:      { display:'block', fontSize:10, fontWeight:700, color:'#390955', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.5px' },
  fi:      { width:'100%', padding:'10px 13px', border:'1.5px solid rgba(57,9,85,0.18)', borderRadius:8, fontSize:13, fontFamily:'inherit', boxSizing:'border-box', background:'white' },
  frow:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 },
  fa:      { display:'flex', gap:10, marginTop:22, paddingTop:18, borderTop:'1px solid #e5ddf0' },
  th:      { padding:'11px 14px', textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', color:'white', background:'#390955', whiteSpace:'nowrap' },
  td:      { padding:'12px 14px', borderBottom:'1px solid #f0eaf8', color:'#333', fontSize:13, verticalAlign:'middle' },
  ov:      { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 },
  modal:   { background:'white', borderRadius:14, padding:'30px', maxWidth:420, width:'90%', boxShadow:'0 16px 48px rgba(57,9,85,0.2)' },
  mt:      { fontSize:17, fontWeight:800, color:'#1a1a1a', margin:'0 0 10px' },
  mb:      { fontSize:13, color:'#666', margin:'0 0 24px', lineHeight:1.6 },
  ma:      { display:'flex', gap:10 },
};

const btnStyle = (v='primary') => {
  const m = {
    primary:   { background:'#390955', color:'white', border:'none', boxShadow:'0 2px 8px rgba(57,9,85,0.25)' },
    secondary: { background:'white', color:'#390955', border:'1.5px solid rgba(57,9,85,0.28)' },
    orange:    { background:'#f37021', color:'white', border:'none', boxShadow:'0 2px 8px rgba(243,112,33,0.25)' },
  };
  return { padding:'9px 18px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', ...(m[v]||m.primary) };
};

const badgeStyle = (s='available') => {
  const m = { available:{ background:'rgba(57,9,85,0.08)', color:'#390955' }, archived:{ background:'#f0eaf8', color:'#7b3fa0' } };
  const c = m[s.toLowerCase()] || m.available;
  return { display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, ...c };
};

const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ padding:'14px 20px', border:'none', background:'transparent', color:active?'#390955':'#666', fontSize:13, fontWeight:active?700:500, cursor:'pointer', borderBottom:active?'2.5px solid #f37021':'2.5px solid transparent', whiteSpace:'nowrap', fontFamily:'inherit' }}>
    {children}
  </button>
);

const TABS = [
  { key:'generate', label:'Generate Report' },
  { key:'retrieve', label:'Retrieve Report' },
  { key:'archive',  label:'Archive Report'  },
];

const statusColor = (s) => s==='Delivered'?'#065f46':s==='In Transit'?'#f37021':'#390955';
const statusBg    = (s) => s==='Delivered'?'#d1fae5':s==='In Transit'?'#fff4ec':'#f0eaf8';

export default function GenerateTrackingInformation({ reports: externalReports, onReportsChange, onArchiveReport = () => {} }) {
  const [tab,            setTab]            = useState('generate');
  const [parcels,        setParcels]        = useState([]);
  const [loadingParcels, setLoadingParcels] = useState(true);
  const [selectedParcel, setSelectedParcel] = useState('');
  const [reportType,     setReportType]     = useState('Full Report');
  const [fileFormat,     setFileFormat]     = useState('PDF');
  const [startDate,      setStartDate]      = useState('');
  const [endDate,        setEndDate]        = useState('');
  const [previewReport,  setPreviewReport]  = useState(null);
  const [generating,     setGenerating]     = useState(false);
  const [successMsg,     setSuccessMsg]     = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState(null);

  const [_reports, _setReports] = useState([]);
  const reports    = externalReports ?? _reports;
  const setReports = (updater) => {
    const next = typeof updater === 'function' ? updater(reports) : updater;
    _setReports(next);
    onReportsChange?.(next);
  };

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  // Fetch real parcels from MongoDB
  useEffect(() => {
    const fetchParcels = async () => {
      try {
        const res = await fetch('http://https://yto-express.onrender.com/api/parcels');
        const data = await res.json();
        setParcels(data);
        if (data.length > 0) setSelectedParcel(data[0].trackingNumber);
      } catch (err) {
        console.error('Error fetching parcels:', err);
        setParcels([]);
      } finally {
        setLoadingParcels(false);
      }
    };
    fetchParcels();
  }, []);

  const handleGenerate = () => {
    if (!selectedParcel) { alert('Please select a parcel tracking number.'); return; }
    setGenerating(true);
    setTimeout(() => {
      const parcelInfo = parcels.find(p => p.trackingNumber === selectedParcel);
      const newId  = `TR-${String(reports.length + 1).padStart(3, '0')}`;
      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const newReport = {
        id: newId,
        trackingNo: selectedParcel,
        generatedDate: nowStr,
        reportType,
        format: fileFormat,
        status: 'Available',
        location: parcelInfo?.destination || parcelInfo?.origin || 'Unknown',
        startDate, endDate,
        events: parcelInfo?.events || [
          { time: nowStr, event: 'Report generated', location: parcelInfo?.destination || 'Unknown', status: parcelInfo?.status || 'Active' }
        ],
      };
      setReports(prev => [newReport, ...prev]);
      setPreviewReport(newReport);
      setGenerating(false);
      showSuccess(`Report ${newId} generated successfully!`);
    }, 1200);
  };

  const handleClearForm = () => {
    setSelectedParcel(parcels.length > 0 ? parcels[0].trackingNumber : '');
    setReportType('Full Report'); setFileFormat('PDF');
    setStartDate(''); setEndDate('');
    setPreviewReport(null);
  };

  const handleDownload = (report) => {
    const evRows = (report.events || []).map((e, i) => `
      <tr style="background:${i%2===0?'white':'#f9f9f9'}">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${e.time}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${e.event}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${e.location}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${statusBg(e.status)};color:${statusColor(e.status)};">${e.status}</span>
        </td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Tracking Report — ${report.trackingNo}</title>
      <style>body{font-family:-apple-system,sans-serif;padding:32px;color:#1a1a1a;}h1{font-size:22px;color:#390955;margin-bottom:4px;}.meta{font-size:12px;color:#666;margin-bottom:24px;}.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;}.info-card{padding:12px 16px;background:#f9f7ff;border:1px solid #e5ddf0;border-radius:8px;}.info-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:#9b82b2;margin-bottom:4px;}.info-value{font-size:14px;font-weight:700;color:#390955;}table{width:100%;border-collapse:collapse;}th{padding:10px 12px;background:#390955;color:white;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;}@media print{body{padding:16px;}}</style>
      </head><body>
      <h1>📦 Tracking Report — YTO Express</h1>
      <div class="meta">Generated: ${report.generatedDate} · Report ID: ${report.id} · Type: ${report.reportType} · Format: ${report.format}</div>
      <div class="info-grid">
        <div class="info-card"><div class="info-label">Tracking Number</div><div class="info-value">${report.trackingNo}</div></div>
        <div class="info-card"><div class="info-label">Location</div><div class="info-value">${report.location}</div></div>
        <div class="info-card"><div class="info-label">Period</div><div class="info-value">${report.startDate||'—'} to ${report.endDate||'—'}</div></div>
      </div>
      <h3 style="color:#390955;margin-bottom:12px;">Tracking Events Timeline</h3>
      ${(report.events||[]).length>0
        ? `<table><thead><tr><th>Date & Time</th><th>Event</th><th>Location</th><th>Status</th></tr></thead><tbody>${evRows}</tbody></table>`
        : `<p style="color:#aaa;font-size:13px;">No tracking events recorded.</p>`}
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    win.document.close();
  };

  const doArchive = (id) => {
    const target = reports.find(r => r.id === id);
    if (!target) return;
    onArchiveReport({ ...target, status:'Archived' });
    setReports(prev => prev.map(r => r.id===id ? { ...r, status:'Archived' } : r));
    setArchiveConfirm(null);
    showSuccess(`Report ${id} archived.`);
  };

  const available = reports.filter(r => r.status === 'Available');
  const archived  = reports.filter(r => r.status === 'Archived');

  const content = () => {
    switch(tab) {
      case 'generate': return (
        <div style={S.panel}>
          <h2 style={S.ph}>Generate Tracking Report</h2>
          <p style={S.ps}>Select a parcel from your database and generate a tracking report.</p>
          <div style={S.fw}>
            <div style={S.fg}>
              <label style={S.fl}>Tracking Number *</label>
              {loadingParcels ? (
                <div style={{ padding:'10px 13px', border:'1.5px solid rgba(57,9,85,0.18)', borderRadius:8, fontSize:13, color:'#9b82b2', background:'white' }}>Loading parcels from database...</div>
              ) : parcels.length === 0 ? (
                <div style={{ padding:'10px 13px', border:'1.5px solid #fca5a5', borderRadius:8, fontSize:13, color:'#991b1b', background:'#fff5f5' }}>
                  No parcels registered yet. Register parcels in Manage Parcels first.
                </div>
              ) : (
                <select style={S.fi} value={selectedParcel} onChange={e => setSelectedParcel(e.target.value)}>
                  <option value="">— Select a parcel —</option>
                  {parcels.map(p => (
                    <option key={p._id} value={p.trackingNumber}>
                      {p.trackingNumber} · {p.destination || p.origin || 'Unknown'}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={S.frow}>
              <div style={S.fg}>
                <label style={S.fl}>Report Type *</label>
                <select style={S.fi} value={reportType} onChange={e => setReportType(e.target.value)}>
                  <option>Full Report</option><option>GPS Tracking</option><option>Delivery Summary</option>
                </select>
              </div>
              <div style={S.fg}>
                <label style={S.fl}>Format *</label>
                <select style={S.fi} value={fileFormat} onChange={e => setFileFormat(e.target.value)}>
                  <option>PDF</option><option>Excel</option><option>JSON</option>
                </select>
              </div>
            </div>
            <div style={S.frow}>
              <div style={S.fg}><label style={S.fl}>Start Date</label><input type="date" style={S.fi} value={startDate} onChange={e => setStartDate(e.target.value)}/></div>
              <div style={S.fg}><label style={S.fl}>End Date</label><input type="date" style={S.fi} value={endDate} onChange={e => setEndDate(e.target.value)}/></div>
            </div>
            <div style={S.fa}>
              <button style={btnStyle('primary')} onClick={handleGenerate} disabled={generating || parcels.length === 0}>
                {generating ? '⏳ Generating…' : '📄 Generate Report'}
              </button>
              <button style={btnStyle('secondary')} onClick={handleClearForm}>Clear</button>
            </div>
          </div>

          {previewReport && (
            <div style={{ marginTop:24, background:'#f0eaf8', border:'1.5px solid #d4b8ee', borderRadius:12, padding:'20px 22px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#390955' }}>✅ Report Generated — {previewReport.id}</div>
                  <div style={{ fontSize:12, color:'#9b82b2', marginTop:3 }}>{previewReport.trackingNo} · {previewReport.generatedDate}</div>
                </div>
                <button style={btnStyle('orange')} onClick={() => handleDownload(previewReport)}>⬇ Download Now</button>
              </div>
              {previewReport.events.length > 0 && (
                <div style={{ background:'white', borderRadius:9, border:'1px solid #e5ddf0', overflow:'hidden' }}>
                  <div style={{ padding:'10px 14px', background:'#390955' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'white', textTransform:'uppercase' }}>Tracking Events Timeline</span>
                  </div>
                  {previewReport.events.map((ev, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'12px 16px', borderBottom:i<previewReport.events.length-1?'1px solid #f0eaf8':'none', background:i%2===0?'white':'#fdfcff' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'#f37021', marginTop:4, flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'#1a0a2e' }}>{ev.event}</div>
                        <div style={{ fontSize:11, color:'#9b82b2', marginTop:2 }}>{ev.time} · {ev.location}</div>
                      </div>
                      <span style={{ padding:'3px 9px', borderRadius:12, fontSize:11, fontWeight:700, background:statusBg(ev.status), color:statusColor(ev.status) }}>{ev.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );

      case 'retrieve': return (
        <div style={S.panel}>
          <h2 style={S.ph}>Retrieve Tracking Report</h2>
          <p style={S.ps}>All generated reports are listed here. Click Download to open the full printable report.</p>
          {available.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'#bbb', fontSize:13 }}>No available reports yet. Generate one first!</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr>{['Report ID','Tracking No.','Location','Report Type','Format','Generated Date','Action'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {available.map((r, i) => (
                    <tr key={r.id} style={{ background:i%2===0?'white':'#faf9ff' }}>
                      <td style={{ ...S.td, fontWeight:700, color:'#390955' }}>{r.id}</td>
                      <td style={{ ...S.td, fontFamily:'monospace', fontSize:12 }}>{r.trackingNo}</td>
                      <td style={S.td}>{r.location}</td>
                      <td style={S.td}>{r.reportType}</td>
                      <td style={S.td}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:'#f0eaf8', color:'#390955' }}>{r.format}</span></td>
                      <td style={{ ...S.td, fontSize:12, color:'#888' }}>{r.generatedDate}</td>
                      <td style={S.td}>
                        <button style={{ padding:'6px 14px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', background:'#f37021', color:'white', border:'none' }}
                          onClick={() => handleDownload(r)}>⬇ Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

      case 'archive': return (
        <div style={S.panel}>
          <h2 style={S.ph}>Archive Report</h2>
          <p style={S.ps}>Archive reports to hide them from active operations.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:28 }}>
            {available.length > 0 ? available.map(r => (
              <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', background:'white', borderRadius:10, border:'1px solid #e5ddf0', borderLeft:'4px solid #f37021' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', marginBottom:3 }}>
                    {r.id} <span style={{ ...badgeStyle('available'), marginLeft:10 }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#888', fontFamily:'monospace' }}>{r.trackingNo} · {r.generatedDate} · {r.reportType}</div>
                </div>
                <button style={{ padding:'5px 13px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', background:'#f37021', color:'white', border:'none' }}
                  onClick={() => setArchiveConfirm(r.id)}>Archive</button>
              </div>
            )) : (
              <p style={{ color:'#aaa', fontSize:13, textAlign:'center', padding:'28px', background:'#faf9ff', border:'1.5px dashed #d4c8e8', borderRadius:9 }}>No active reports to archive.</p>
            )}
          </div>
          {archived.length > 0 && (
            <>
              <div style={{ fontSize:12, fontWeight:700, color:'#390955', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Already Archived</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {archived.map(r => (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', background:'#fdfcfe', borderRadius:10, border:'1px solid #e5ddf0', borderLeft:'4px solid #c9a0e0', opacity:0.9 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:3 }}>{r.id} <span style={{ ...badgeStyle('archived'), marginLeft:10 }}>Archived</span></div>
                      <div style={{ fontSize:12, color:'#aaa', fontFamily:'monospace' }}>{r.trackingNo} · {r.generatedDate}</div>
                    </div>
                    <span style={{ fontSize:11, color:'#c9a0e0', fontWeight:600 }}>Managed in Settings</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      );

      default: return null;
    }
  };

  return (
    <div style={S.wrap}>
      <header style={S.header}>
        <div>
          <h1 style={S.title}>Generate Tracking Information</h1>
          <nav style={{ display:'flex', alignItems:'center', gap:5, marginTop:4 }}>
            {['Dashboard','GPS-Based Parcel Tracking','Generate Tracking Information'].map((b, i, arr) => (
              <React.Fragment key={b}>
                <span style={{ fontSize:11, color:i===arr.length-1?'#f37021':'#9b82b2', fontWeight:i===arr.length-1?700:400 }}>{b}</span>
                {i < arr.length-1 && <span style={{ fontSize:11, color:'rgba(57,9,85,0.2)' }}>/</span>}
              </React.Fragment>
            ))}
          </nav>
        </div>
      </header>

      {successMsg && (
        <div style={{ background:'#d4f4dd', color:'#22863a', padding:'12px 28px', fontSize:13, fontWeight:600, borderBottom:'1px solid #51cf66' }}>
          ✅ {successMsg}
        </div>
      )}

      <div style={S.tabs}>
        {TABS.map(t => <TabBtn key={t.key} active={tab===t.key} onClick={() => setTab(t.key)}>{t.label}</TabBtn>)}
      </div>

      <div style={S.content}>{content()}</div>

      {archiveConfirm && (
        <div style={S.ov}>
          <div style={S.modal}>
            <h3 style={S.mt}>Confirm Archive</h3>
            <p style={S.mb}>Are you sure you want to archive report <strong>{archiveConfirm}</strong>?</p>
            <div style={S.ma}>
              <button style={{ ...btnStyle('secondary'), flex:1 }} onClick={() => setArchiveConfirm(null)}>Cancel</button>
              <button style={{ ...btnStyle('orange'), flex:1 }} onClick={() => doArchive(archiveConfirm)}>Archive Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}