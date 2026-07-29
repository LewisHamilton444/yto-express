'use client';
import React, { useState } from 'react';

const MOCK_PARCELS = [
  { id: 'PKG-001', receiver: 'John Doe',    address: '123 Main St, New York, NY 10001',       weight: '2.5kg', sender: 'Amazon Warehouse',    shipDate: '2025-02-18', estimatedDelivery: '2025-02-21', contents: 'Electronics',     value: '$250.00', service: 'Express',   status: 'Delivered' },
  { id: 'PKG-002', receiver: 'Jane Smith',  address: '456 Oak Ave, Los Angeles, CA 90001',     weight: '1.8kg', sender: 'eBay Fulfillment',     shipDate: '2025-02-19', estimatedDelivery: '2025-02-22', contents: 'Books',           value: '$120.00', service: 'Standard',  status: 'In Transit' },
  { id: 'PKG-003', receiver: 'Bob Johnson', address: '789 Pine Rd, Chicago, IL 60601',         weight: '3.2kg', sender: 'Walmart Distribution', shipDate: '2025-02-17', estimatedDelivery: '2025-02-20', contents: 'Household Items', value: '$180.00', service: 'Overnight', status: 'Delivered' },
  { id: 'PKG-004', receiver: 'Alice Chen',  address: '321 Elm St, Houston, TX 77001',          weight: '4.1kg', sender: 'Best Buy Online',      shipDate: '2025-02-20', estimatedDelivery: '2025-02-23', contents: 'Computer Parts', value: '$520.00', service: 'Express',   status: 'Out for Delivery' },
  { id: 'PKG-005', receiver: 'Mike Torres', address: '654 Maple Dr, Phoenix, AZ 85001',        weight: '2.0kg', sender: 'Target Fulfillment',   shipDate: '2025-02-21', estimatedDelivery: '2025-02-24', contents: 'Clothing',        value: '$95.00',  service: 'Standard',  status: 'Pending' },
];

const DELIVERY_EVENTS_MAP = {
  'Delivered':        [
    { timestamp: '2025-02-18 08:00', event: 'Package Picked Up',  location: 'Warehouse, Newark' },
    { timestamp: '2025-02-18 14:30', event: 'In Transit',         location: 'New Jersey Hub' },
    { timestamp: '2025-02-19 06:00', event: 'Out for Delivery',   location: 'Local Delivery Station' },
    { timestamp: '2025-02-19 15:45', event: 'Delivery Attempted', location: 'Recipient Address' },
    { timestamp: '2025-02-20 09:00', event: 'Delivered',          location: 'Recipient Address' },
  ],
  'In Transit':       [
    { timestamp: '2025-02-19 09:00', event: 'Package Picked Up',  location: 'eBay Warehouse, Inglewood' },
    { timestamp: '2025-02-19 17:00', event: 'Departed Facility',  location: 'Los Angeles Sorting Hub' },
    { timestamp: '2025-02-20 08:30', event: 'In Transit',         location: 'Regional Distribution Center' },
  ],
  'Out for Delivery': [
    { timestamp: '2025-02-20 07:00', event: 'Package Picked Up',  location: 'Best Buy Warehouse, Austin' },
    { timestamp: '2025-02-21 04:00', event: 'Arrived at Facility',location: 'Houston Sorting Center' },
    { timestamp: '2025-02-22 08:00', event: 'Out for Delivery',   location: 'Houston Local Station' },
  ],
  'Pending':          [
    { timestamp: '2025-02-21 10:00', event: 'Order Received',     location: 'Target Fulfillment Center' },
    { timestamp: '2025-02-21 14:00', event: 'Processing',         location: 'Target Fulfillment Center' },
  ],
};

const STATUS_CONFIG = {
  'Delivered':        { color: '#390955', bg: '#f0eaf8', dot: '#390955' },
  'In Transit':       { color: '#0369a1', bg: '#e0f2fe', dot: '#0369a1' },
  'Out for Delivery': { color: '#b45309', bg: '#fef3c7', dot: '#d97706' },
  'Pending':          { color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
};

const SERVICE_CONFIG = {
  Express:   { color: '#7c3aed', bg: '#ede9fe' },
  Standard:  { color: '#0369a1', bg: '#e0f2fe' },
  Overnight: { color: '#b45309', bg: '#fef3c7' },
};

const EXPORT_FORMATS = [
  { key: 'pdf', label: 'PDF Document',    desc: 'Portable, print-ready' },
  { key: 'txt', label: 'Text File',       desc: 'Plain text format' },
  { key: 'csv', label: 'CSV Spreadsheet', desc: 'Excel-compatible' },
];

// ── Timeline ─────────────────────────────────────────────────────────────────
function Timeline({ events }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '16px', flexShrink: 0 }}>
            <div style={{
              width: i === events.length - 1 ? '14px' : '11px',
              height: i === events.length - 1 ? '14px' : '11px',
              borderRadius: '50%', background: '#390955',
              border: '2px solid white', boxShadow: '0 0 0 2.5px rgba(57,9,85,0.18)', marginTop: '3px',
            }} />
            {i < events.length - 1 && (
              <div style={{ width: '2px', flex: 1, minHeight: '24px', background: 'rgba(57,9,85,0.12)', margin: '3px 0' }} />
            )}
          </div>
          <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? '16px' : 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#390955', fontFamily: 'monospace', letterSpacing: '0.2px' }}>{ev.timestamp}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a1a', margin: '3px 0 2px' }}>{ev.event}</div>
            <div style={{ fontSize: '11px', color: '#999' }}>{ev.location}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Inline Drawer ─────────────────────────────────────────────────────────────
function ParcelDrawer({ parcel, onClose, exportFmt, setExportFmt }) {
  const sc = STATUS_CONFIG[parcel.status] ?? STATUS_CONFIG['Pending'];
  const events = DELIVERY_EVENTS_MAP[parcel.status] ?? DELIVERY_EVENTS_MAP['Pending'];
  const reportDate = new Date().toLocaleString();
  const trackingNumber = `TRK-${parcel.id}-AUTOgen`;
  const reportId = `RPT-${parcel.id}`;

  const handleExport = () => {
    if (exportFmt === 'csv') {
      const content = `Parcel ID,Timestamp,Event,Location\n${events.map(e => `${parcel.id},"${e.timestamp}","${e.event}","${e.location}"`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${parcel.id}.csv`; a.click();
    } else if (exportFmt === 'txt') {
      const content = `DELIVERY STATUS REPORT\n${reportDate}\n\nParcel ID: ${parcel.id}\nTracking: ${trackingNumber}\nStatus: ${parcel.status}\n\nTIMELINE:\n${events.map(e => `[${e.timestamp}] ${e.event} — ${e.location}`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${parcel.id}.txt`; a.click();
    } else { alert('Exported as PDF'); }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Delivery Report</title><style>body{font-family:Arial,sans-serif;margin:20px}h1{color:#390955}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e7eb;padding:10px;text-align:left}th{background:#f0eaf8}</style></head><body><h1>Delivery Status Report</h1><p>${reportDate}</p><p><strong>Parcel:</strong> ${parcel.id} | <strong>Tracking:</strong> ${trackingNumber} | <strong>Status:</strong> ${parcel.status}</p><h3>Parcel Details</h3><p>Recipient: ${parcel.receiver}<br>Sender: ${parcel.sender}<br>Address: ${parcel.address}<br>Weight: ${parcel.weight} | Value: ${parcel.value} | Service: ${parcel.service}</p><h3>Delivery Timeline</h3><table><tr><th>Timestamp</th><th>Event</th><th>Location</th></tr>${events.map(e => `<tr><td>${e.timestamp}</td><td>${e.event}</td><td>${e.location}</td></tr>`).join('')}</table><script>window.print();<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div style={{ background: '#faf8ff', border: '1.5px solid #ddd0f5', borderRadius: '12px', overflow: 'hidden', animation: 'drawer-open 0.22s cubic-bezier(.22,.68,0,1.2)' }}>

      {/* Drawer header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', background: '#390955' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)', animation: 'pulse-dot 2s infinite' }} />
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'white', letterSpacing: '-0.2px' }}>Report — {parcel.id}</span>
          <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.18)', color: 'white', padding: '2px 9px', borderRadius: '20px', fontWeight: 700 }}>{parcel.status}</span>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>{reportId}</span>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* 3-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr' }}>

        {/* ── Col 1: Parcel Details ── */}
        <div style={{ padding: '20px 22px', borderRight: '1px solid #ede6f8' }}>
          <SectionHeading icon={
            <div style={{ width: '20px', height: '20px', background: '#f37021', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="11" height="11"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
          } label="Parcel Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginTop: '14px' }}>
            {[
              ['Report ID',     reportId,                   true ],
              ['Tracking No.',  trackingNumber,             true ],
              ['Recipient',     parcel.receiver,            false],
              ['Sender',        parcel.sender,              false],
              ['Contents',      parcel.contents,            false],
              ['Value',         parcel.value,               false],
              ['Weight',        parcel.weight,              false],
              ['Service',       parcel.service,             false],
              ['Ship Date',     parcel.shipDate,            true ],
              ['Est. Delivery', parcel.estimatedDelivery,   true ],
            ].map(([l, v, mono]) => (
              <div key={l}>
                <div style={{ fontSize: '10px', color: '#c4b0d8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{l}</div>
                <div style={{ fontSize: '12px', color: '#1a1a1a', fontWeight: 700, fontFamily: mono ? "'Courier New', monospace" : 'inherit', lineHeight: 1.3 }}>{v}</div>
              </div>
            ))}
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: '10px', color: '#c4b0d8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Delivery Address</div>
              <div style={{ fontSize: '12px', color: '#1a1a1a', fontWeight: 700, lineHeight: 1.4 }}>{parcel.address}</div>
            </div>
          </div>
        </div>

        {/* ── Col 2: Delivery Timeline ── */}
        <div style={{ padding: '20px 22px', borderRight: '1px solid #ede6f8' }}>
          <SectionHeading icon={
            <div style={{ width: '20px', height: '20px', background: '#f37021', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="11" height="11"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
          } label="Delivery Timeline" />
          {/* Live status pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: sc.bg, borderRadius: '8px', marginTop: '14px', marginBottom: '18px', border: `1px solid ${sc.color}28` }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: 800, color: sc.color }}>{parcel.status}</span>
            <span style={{ fontSize: '10px', color: '#bbb', marginLeft: 'auto', fontFamily: 'monospace' }}>{new Date().toLocaleTimeString()}</span>
          </div>
          <Timeline events={events} />
        </div>

        {/* ── Col 3: Export & Print ── */}
        <div style={{ padding: '20px 22px' }}>
          <SectionHeading icon={
            <div style={{ width: '20px', height: '20px', background: '#f37021', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="11" height="11"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
          } label="Export & Print" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px', marginBottom: '12px' }}>
            {EXPORT_FORMATS.map(fmt => (
              <div key={fmt.key} onClick={() => setExportFmt(fmt.key)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 11px', background: exportFmt === fmt.key ? '#f0eaf8' : 'white', border: `1.5px solid ${exportFmt === fmt.key ? '#390955' : '#e8e0f5'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.13s' }}>
                <div style={{ width: '28px', height: '28px', background: '#390955', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a' }}>{fmt.label}</div>
                  <div style={{ fontSize: '10px', color: '#bbb' }}>{fmt.desc}</div>
                </div>
                {exportFmt === fmt.key && (
                  <div style={{ width: '18px', height: '18px', background: '#390955', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" width="9" height="9"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', background: '#390955', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit', marginBottom: '8px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/></svg>
            Export as {exportFmt.toUpperCase()}
          </button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', background: 'white', color: '#390955', border: '2px solid #390955', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="13" height="13"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Report
          </button>

          {/* Mini preview */}
          <div style={{ marginTop: '14px', border: '1.5px solid #e0d5f0', borderRadius: '9px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#390955', padding: '7px 11px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />)}
              <span style={{ marginLeft: '4px', fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Print Preview</span>
            </div>
            <div style={{ padding: '12px 13px', background: 'white', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#390955' }}>Delivery Status Report</div>
              <div style={{ fontSize: '10px', color: '#bbb' }}>{reportDate}</div>
              <div style={{ height: '1px', background: '#ede6f8', margin: '2px 0' }} />
              {[['Parcel ID', parcel.id], ['Recipient', parcel.receiver], ['Weight', parcel.weight]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888' }}>
                  <span>{l}</span><strong style={{ color: '#1a1a1a' }}>{v}</strong>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#888' }}>
                <span>Status</span>
                <span style={{ background: '#390955', color: 'white', fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' }}>{parcel.status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small shared heading
function SectionHeading({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {icon}
      <span style={{ fontSize: '10px', fontWeight: 800, color: '#390955', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{label}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GenerateParcelStatusReport() {
  const [selected,  setSelected]  = useState(null);
  const [exportFmt, setExportFmt] = useState('pdf');

  const handleRowClick = (id) => setSelected(prev => prev === id ? null : id);

  const s = {
    page:    { flex: 1, overflowY: 'auto', backgroundColor: '#f9f7ff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
    header:  { background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px' },
    title:   { fontSize: '26px', fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px', margin: '0 0 4px 0' },
    sub:     { fontSize: '13px', color: '#666', margin: '2px 0 0 0' },
    bc:      { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' },
    bcItem:  { fontSize: '12px', color: '#666', fontWeight: 500 },
    bcAct:   { fontSize: '12px', color: '#390955', fontWeight: 600 },
    bcSep:   { fontSize: '12px', color: '#d4c8e8' },
    body:    { padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '14px' },
    card:    { background: 'white', borderRadius: '12px', border: '1px solid #e8e0f0', boxShadow: '0 2px 8px rgba(57,9,85,0.05)', overflow: 'hidden' },
    badge:   (solid) => ({ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: solid ? '#390955' : '#f0eaf8', color: solid ? 'white' : '#390955' }),
  };

  // Columns with tighter sizing to avoid horizontal scroll
  const TABLE_COLS = [
    { label: '',             width: '36px'  },
    { label: 'Parcel ID',   width: '100px' },
    { label: 'Receiver',    width: '150px' },
    { label: 'Sender',      width: '130px' },
    { label: 'Service',     width: '90px'  },
    { label: 'Weight',      width: '70px'  },
    { label: 'Value',       width: '80px'  },
    { label: 'Status',      width: '130px' },
    { label: 'Ship Date',   width: '90px'  },
    { label: 'Est. Delivery', width: '100px' },
  ];

  return (
    <div style={s.page}>
      <style>{`
        @keyframes drawer-open { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse-dot   { 0%,100%{ opacity:.45 } 50%{ opacity:1 } }
        .gpsr-row:hover td     { background: #fbf8ff !important; }
        .gpsr-row-active td    { background: #f4eeff !important; }
        .gpsr-row td           { transition: background 0.12s; cursor: pointer; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={s.header}>
        <h1 style={s.title}>General Parcel Status Report</h1>
        <p style={s.sub}>Comprehensive delivery status tracking and reporting system</p>
        <nav style={s.bc}>
          <span style={s.bcItem}>Dashboard</span><span style={s.bcSep}>/</span>
          <span style={s.bcItem}>Parcel Information Management</span><span style={s.bcSep}>/</span>
          <span style={s.bcAct}>General Parcel Status Report</span>
        </nav>
      </header>

      {/* ── BODY ── */}
      <div style={s.body}>
        <div style={s.card}>

          {/* Table toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1.5px solid #f0eaf8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <div style={{ width: '28px', height: '28px', background: '#f37021', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.3px' }}>Parcel List</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {selected
                ? <span style={{ fontSize: '11px', color: '#390955', fontWeight: 700, background: '#f0eaf8', padding: '4px 12px', borderRadius: '20px' }}>1 row expanded</span>
                : <span style={{ fontSize: '12px', color: '#bbb' }}>Click a row to view the report</span>
              }
              <span style={s.badge(false)}>{MOCK_PARCELS.length} records</span>
            </div>
          </div>

          {/* Table — no overflow-x, fixed layout to prevent horizontal scroll */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {TABLE_COLS.map((col, i) => <col key={i} style={{ width: col.width }} />)}
            </colgroup>
            {/* ── THEAD: #390955 background, white text ── */}
            <thead>
              <tr style={{ background: '#390955' }}>
                {TABLE_COLS.map((col, i) => (
                  <th key={i} style={{
                    padding: i === 0 ? '12px 8px 12px 16px' : '12px 10px',
                    textAlign: 'left',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'white',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    borderBottom: '2px solid #2a0640',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_PARCELS.map((p) => {
                const sc  = STATUS_CONFIG[p.status]  ?? STATUS_CONFIG['Pending'];
                const svc = SERVICE_CONFIG[p.service] ?? { color: '#390955', bg: '#f0eaf8' };
                const isActive = selected === p.id;

                return (
                  <React.Fragment key={p.id}>
                    {/* Data row */}
                    <tr className={`gpsr-row${isActive ? ' gpsr-row-active' : ''}`} onClick={() => handleRowClick(p.id)}>

                      {/* Chevron */}
                      <td style={{ padding: '12px 8px 12px 16px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: isActive ? '#390955' : '#f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s', flexShrink: 0 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke={isActive ? 'white' : '#390955'} strokeWidth="2.5" width="10" height="10"
                            style={{ transform: isActive ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </div>
                      </td>

                      {/* Parcel ID */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 800, fontSize: '12px', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.id}</div>
                        <div style={{ fontSize: '9px', color: '#c4b0d8', fontFamily: 'monospace', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.contents}</div>
                      </td>

                      {/* Receiver */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: '12px', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.receiver}</div>
                        <div style={{ fontSize: '10px', color: '#bbb', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</div>
                      </td>

                      {/* Sender */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sender}</div>
                      </td>

                      {/* Service */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 7px', borderRadius: '5px', background: svc.bg, color: svc.color, whiteSpace: 'nowrap' }}>{p.service}</span>
                      </td>

                      {/* Weight */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', fontSize: '12px', fontWeight: 600, color: '#444', whiteSpace: 'nowrap' }}>{p.weight}</td>

                      {/* Value */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', fontSize: '12px', fontWeight: 700, color: '#390955', whiteSpace: 'nowrap' }}>{p.value}</td>

                      {/* Status */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '20px', background: sc.bg }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: '10px', fontWeight: 700, color: sc.color, whiteSpace: 'nowrap' }}>{p.status}</span>
                        </div>
                      </td>

                      {/* Ship Date */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', fontSize: '11px', color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.shipDate}</td>

                      {/* Est. Delivery */}
                      <td style={{ padding: '12px 10px', borderBottom: isActive ? 'none' : '1px solid #f5f0ff', fontSize: '11px', color: '#555', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.estimatedDelivery}</td>
                    </tr>

                    {/* Inline Drawer */}
                    {isActive && (
                      <tr>
                        <td colSpan={TABLE_COLS.length} style={{ padding: '0 20px 20px', background: '#f9f7ff', borderBottom: '2px solid #ddd0f5' }}>
                          <ParcelDrawer
                            parcel={p}
                            onClose={() => setSelected(null)}
                            exportFmt={exportFmt}
                            setExportFmt={setExportFmt}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Table footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderTop: '1px solid #f0eaf8' }}>
            <span style={{ fontSize: '12px', color: '#ccc' }}>Showing {MOCK_PARCELS.length} of {MOCK_PARCELS.length} records</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {MOCK_PARCELS.map(p => {
                const sc = STATUS_CONFIG[p.status] ?? STATUS_CONFIG['Pending'];
                return (
                  <div key={p.id} title={p.id}
                    style={{ width: '9px', height: '9px', borderRadius: '50%', background: sc.dot, opacity: selected === p.id ? 1 : 0.25, transition: 'opacity 0.2s, transform 0.2s', transform: selected === p.id ? 'scale(1.4)' : 'scale(1)' }} />
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty state hint */}
        {!selected && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px 24px', background: 'white', border: '1.5px dashed #d4c8e8', borderRadius: '12px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#d4c8e8" strokeWidth="1.5" width="22" height="22"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <p style={{ fontSize: '13px', color: '#ccc', margin: 0 }}>Select any row above to automatically load the full delivery status report</p>
          </div>
        )}
      </div>
    </div>
  );
}