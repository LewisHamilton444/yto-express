  'use client';
  import React, { useState, useRef } from 'react';

  const now = new Date();
  const daysAgo = (n) => new Date(now - n * 864e5);

  const MOCK_PARCELS = [
    { id: 'PKG-001', trackingNumber: 'TRK-20250221-001', sender: 'Amazon Store',        receiver: 'John Doe',    address: '123 Main St, New York, NY 10001',       phone: '+1-555-0101', email: 'john.doe@email.com',    weight: '2.5kg', dimensions: '30x20x15 cm', contents: 'Electronics',     value: '$250.00', instructions: 'Handle with care, Fragile',      service: 'Express',   date: daysAgo(1),  lat: 40.7128, lng: -74.0060  },
    { id: 'PKG-002', trackingNumber: 'TRK-20250221-002', sender: 'eBay Seller',          receiver: 'Jane Smith',  address: '456 Oak Ave, Los Angeles, CA 90001',    phone: '+1-555-0102', email: 'jane.smith@email.com',  weight: '1.8kg', dimensions: '25x18x12 cm', contents: 'Books & Merch',   value: '$120.00', instructions: 'Leave at door if not home',       service: 'Standard',  date: daysAgo(2),  lat: 34.0522, lng: -118.2437 },
    { id: 'PKG-003', trackingNumber: 'TRK-20250221-003', sender: 'Walmart Distribution', receiver: 'Bob Johnson', address: '789 Pine Rd, Chicago, IL 60601',         phone: '+1-555-0103', email: 'bob.johnson@email.com', weight: '3.2kg', dimensions: '35x25x20 cm', contents: 'Household Items', value: '$180.00', instructions: 'Signature required',             service: 'Overnight', date: daysAgo(5),  lat: 41.8781, lng: -87.6298  },
    { id: 'PKG-004', trackingNumber: 'TRK-20250216-004', sender: 'Best Buy Online',      receiver: 'Alice Chen',  address: '321 Elm St, Houston, TX 77001',          phone: '+1-555-0104', email: 'alice.chen@email.com',  weight: '4.1kg', dimensions: '40x30x25 cm', contents: 'Computer Parts',  value: '$520.00', instructions: 'Handle with extreme care',        service: 'Express',   date: daysAgo(8),  lat: 29.7604, lng: -95.3698  },
    { id: 'PKG-005', trackingNumber: 'TRK-20250214-005', sender: 'Target Fulfillment',   receiver: 'Mike Torres', address: '654 Maple Dr, Phoenix, AZ 85001',        phone: '+1-555-0105', email: 'mike.t@email.com',      weight: '2.0kg', dimensions: '28x22x10 cm', contents: 'Clothing',        value: '$95.00',  instructions: 'Leave with neighbor if absent',  service: 'Standard',  date: daysAgo(12), lat: 33.4484, lng: -112.0740 },
    { id: 'PKG-006', trackingNumber: 'TRK-20250210-006', sender: 'Shopify Merchant',     receiver: 'Sara Kim',    address: '987 Cedar Blvd, Philadelphia, PA 19101', phone: '+1-555-0106', email: 'sara.kim@email.com',    weight: '1.2kg', dimensions: '20x15x8 cm',  contents: 'Cosmetics',       value: '$75.00',  instructions: 'Ring doorbell',                 service: 'Standard',  date: daysAgo(18), lat: 39.9526, lng: -75.1652  },
    { id: 'PKG-007', trackingNumber: 'TRK-20250205-007', sender: 'Newegg Warehouse',     receiver: 'David Park',  address: '147 Birch Ln, San Antonio, TX 78201',    phone: '+1-555-0107', email: 'd.park@email.com',      weight: '5.5kg', dimensions: '50x40x30 cm', contents: 'PC Components',   value: '$890.00', instructions: 'Adult signature required',       service: 'Overnight', date: daysAgo(22), lat: 29.4241, lng: -98.4936  },
    { id: 'PKG-008', trackingNumber: 'TRK-20250201-008', sender: 'Chewy Auto-Ship',      receiver: 'Lisa Nguyen', address: '258 Willow Ave, San Diego, CA 92101',    phone: '+1-555-0108', email: 'lisa.n@email.com',      weight: '6.8kg', dimensions: '55x45x35 cm', contents: 'Pet Supplies',    value: '$145.00', instructions: 'Leave at back porch',            service: 'Standard',  date: daysAgo(27), lat: 32.7157, lng: -117.1611 },
  ];

  const FILTERS = [
    { label: 'Last 3 Days',  key: '3d',  days: 3  },
    { label: 'Last 7 Days',  key: '7d',  days: 7  },
    { label: 'Last 30 Days', key: '30d', days: 30 },
  ];

  const SERVICE_STYLE = {
    Express:   { bg: '#fdf2ff', color: '#7c3aed', border: '#e9d5ff' },
    Standard:  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    Overnight: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  };

  function filteredParcels(filter) {
    return MOCK_PARCELS.filter(p => p.date >= daysAgo(filter.days));
  }

  function MiniMap({ parcel, gps, geofence }) {
    const VW = 400, VH = 200;
    const minLat = 29, maxLat = 42, minLng = -120, maxLng = -73;
    const project = (lat, lng) => ({
      x: ((lng - minLng) / (maxLng - minLng)) * VW,
      y: VH - ((lat - minLat) / (maxLat - minLat)) * VH,
    });
    const pin = project(gps.lat, gps.lng);
    const gridLines = [];
    for (let i = 0; i <= 5; i++) {
      gridLines.push({ x1: 0, y1: (VH / 5) * i, x2: VW, y2: (VH / 5) * i });
      gridLines.push({ x1: (VW / 5) * i, y1: 0, x2: (VW / 5) * i, y2: VH });
    }
    return (
      <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #e0d5f0' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>
          <rect width={VW} height={VH} fill="#e8ecf5" />
          {gridLines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(57,9,85,0.08)" strokeWidth="1" />)}
          {MOCK_PARCELS.filter(p => p.id !== parcel.id).map(p => {
            const pt = project(p.lat, p.lng);
            return <circle key={p.id} cx={pt.x} cy={pt.y} r="4" fill="rgba(57,9,85,0.2)" stroke="white" strokeWidth="1" />;
          })}
          {geofence && (
            <>
              <circle cx={pin.x} cy={pin.y} r="32" fill="rgba(57,9,85,0.06)" stroke="rgba(57,9,85,0.25)" strokeWidth="1.5" strokeDasharray="5,3" />
              <circle cx={pin.x} cy={pin.y} r="18" fill="rgba(57,9,85,0.08)" stroke="rgba(57,9,85,0.35)" strokeWidth="1" />
            </>
          )}
          <circle cx={pin.x} cy={pin.y} r="22" fill="none" stroke="rgba(57,9,85,0.35)" strokeWidth="1.5">
            <animate attributeName="r" values="14;30" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={pin.x} cy={pin.y} r="22" fill="none" stroke="rgba(57,9,85,0.2)" strokeWidth="1">
            <animate attributeName="r" values="10;38" dur="2s" begin="0.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0" dur="2s" begin="0.5s" repeatCount="indefinite" />
          </circle>
          <ellipse cx={pin.x} cy={pin.y + 14} rx="7" ry="3" fill="rgba(0,0,0,0.18)" />
          <path d={`M${pin.x},${pin.y + 12} C${pin.x - 10},${pin.y + 2} ${pin.x - 10},${pin.y - 12} ${pin.x},${pin.y - 14} C${pin.x + 10},${pin.y - 12} ${pin.x + 10},${pin.y + 2} ${pin.x},${pin.y + 12}Z`} fill="#390955" stroke="white" strokeWidth="1.5">
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="1.8s" repeatCount="indefinite" />
          </path>
          <circle cx={pin.x} cy={pin.y - 5} r="3.5" fill="white">
            <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <rect x={pin.x - 56} y={pin.y + 16} width="112" height="20" rx="4" fill="rgba(57,9,85,0.88)" />
          <text x={pin.x} y={pin.y + 29} textAnchor="middle" fill="white" fontSize="9" fontFamily="'Courier New', monospace" fontWeight="bold">
            {gps.lat.toFixed(4)}° N, {Math.abs(gps.lng).toFixed(4)}° W
          </text>
        </svg>
        <div style={{ position: 'absolute', top: 8, left: 8, background: geofence?.inside ? '#390955' : 'white', color: geofence?.inside ? 'white' : '#390955', border: '1.5px solid #390955', fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px' }}>
          {geofence ? (geofence.inside ? '✓ Inside Zone' : '✗ Outside Zone') : '● Live GPS'}
        </div>
        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.9)', fontSize: '10px', color: '#666', padding: '3px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
          {gps.satellites} sats · ±{gps.accuracy}m
        </div>
      </div>
    );
  }

  function ParcelModal({ parcel, onClose, onSelect }) {
    const svc = SERVICE_STYLE[parcel.service] || SERVICE_STYLE.Standard;
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,5,35,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(3px)' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '18px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(57,9,85,0.25)', animation: 'gpcs-modal-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}>
          <div style={{ padding: '22px 24px 16px', borderBottom: '1.5px solid #f5f0ff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'white', zIndex: 1, borderRadius: '18px 18px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
              <div style={{ width: '44px', height: '44px', background: '#390955', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="20" height="20"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.4px' }}>{parcel.id}</div>
                <div style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace', marginTop: '3px' }}>{parcel.trackingNumber}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: svc.bg, color: svc.color, border: `1px solid ${svc.border}` }}>{parcel.service}</span>
              <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1.5px solid #e0d5f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '14px' }}>✕</button>
            </div>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[{ label: 'From', name: parcel.sender, sub: null }, { label: 'To', name: parcel.receiver, sub: parcel.phone }].map(({ label, name, sub }) => (
                <div key={label} style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: '10px', padding: '14px 15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a1a' }}>{name}</div>
                  {sub && <div style={{ fontSize: '11px', color: '#888', marginTop: '3px', fontFamily: 'monospace' }}>{sub}</div>}
                </div>
              ))}
            </div>
            <div style={{ background: '#faf8ff', border: '1.5px solid #ebe4f5', borderRadius: '10px', padding: '14px 15px', display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: '2px' }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Delivery Address</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{parcel.address}</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Package Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[['Weight', parcel.weight], ['Dimensions', parcel.dimensions], ['Value', parcel.value], ['Contents', parcel.contents], ['Email', parcel.email], ['Date', parcel.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })]].map(([l, v]) => (
                  <div key={l} style={{ background: 'white', border: '1px solid #ebe4f5', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{l}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-all' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', background: '#f5f0ff', border: '1.5px solid #ddd0f8', borderRadius: '10px', padding: '13px 15px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="15" height="15" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Special Instructions</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#390955' }}>{parcel.instructions}</div>
              </div>
            </div>
          </div>
          <div style={{ padding: '16px 24px 20px', borderTop: '1.5px solid #f5f0ff', display: 'flex', gap: '10px', position: 'sticky', bottom: 0, background: 'white', borderRadius: '0 0 18px 18px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: '9px', border: '1.5px solid #e0d5f0', background: 'white', color: '#666', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
            <button onClick={() => { onSelect(parcel.id); onClose(); }} style={{ flex: 2, padding: '11px', borderRadius: '9px', border: 'none', background: '#390955', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
              Select &amp; Load GPS Confirmation
            </button>
          </div>
        </div>
      </div>
    );
  }

  export default function GenerateParcelConfirmationStatus() {
    const [activeFilter, setActiveFilter] = useState(FILTERS[2]);
    const [selected, setSelected]         = useState(null);
    const [parcelInfo, setParcelInfo]     = useState(null);
    const [gps, setGps]                   = useState(null);
    const [geofence, setGeofence]         = useState(null);
    const [confirmCode, setConfirmCode]   = useState('');
    const [signature, setSignature]       = useState(null);
    const [mapLoading, setMapLoading]     = useState(false);
    const [sortCol, setSortCol]           = useState('date');
    const [sortDir, setSortDir]           = useState('desc');
    const [searchQuery, setSearchQuery]   = useState('');
    const [viewModal, setViewModal]       = useState(null);
    const detailRef = useRef(null);

    const visible = filteredParcels(activeFilter);

    const searched = searchQuery.trim()
      ? visible.filter(p => {
          const q = searchQuery.toLowerCase();
          return p.id.toLowerCase().includes(q) || p.receiver.toLowerCase().includes(q) || p.sender.toLowerCase().includes(q) || p.contents.toLowerCase().includes(q);
        })
      : visible;

    const sortedVisible = [...searched].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'date')  { va = a.date.getTime(); vb = b.date.getTime(); }
      if (sortCol === 'value') { va = parseFloat(a.value.replace('$', '')); vb = parseFloat(b.value.replace('$', '')); }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const handleSort = (col) => {
      if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setSortCol(col); setSortDir('asc'); }
    };

    const handleFilterChange = (f) => {
      setActiveFilter(f);
      if (selected) {
        const p = MOCK_PARCELS.find(x => x.id === selected);
        if (p && p.date < daysAgo(f.days)) {
          setSelected(null); setParcelInfo(null); setGps(null); setGeofence(null); setSignature(null);
        }
      }
    };

    const handleSelect = (id) => {
      const p = MOCK_PARCELS.find(x => x.id === id);
      setSelected(id); setParcelInfo(p);
      setConfirmCode(`CONF-${id}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`);
      setSignature(null); setMapLoading(true);
      setTimeout(() => {
        const jitter = () => (Math.random() - 0.5) * 0.08;
        const lat = parseFloat((p.lat + jitter()).toFixed(6));
        const lng = parseFloat((p.lng + jitter()).toFixed(6));
        setGps({ lat, lng, accuracy: (Math.random() * 8 + 2).toFixed(1), satellites: Math.floor(Math.random() * 8 + 10), timestamp: new Date().toLocaleTimeString() });
        const inside = Math.random() > 0.35;
        setGeofence({ inside, status: inside ? 'Inside Geofence' : 'Outside Geofence', zone: 'Delivery Zone A', radius: (Math.random() * 4 + 0.5).toFixed(2), distance: (Math.random() * 1.5 + 0.1).toFixed(2) });
        setMapLoading(false);
        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }, 900);
    };

    const handleRefreshGPS = () => {
      if (!parcelInfo) return;
      setMapLoading(true);
      setTimeout(() => {
        const jitter = () => (Math.random() - 0.5) * 0.06;
        const lat = parseFloat((parcelInfo.lat + jitter()).toFixed(6));
        const lng = parseFloat((parcelInfo.lng + jitter()).toFixed(6));
        setGps({ lat, lng, accuracy: (Math.random() * 8 + 2).toFixed(1), satellites: Math.floor(Math.random() * 8 + 10), timestamp: new Date().toLocaleTimeString() });
        const inside = Math.random() > 0.35;
        setGeofence({ inside, status: inside ? 'Inside Geofence' : 'Outside Geofence', zone: 'Delivery Zone A', radius: (Math.random() * 4 + 0.5).toFixed(2), distance: (Math.random() * 1.5 + 0.1).toFixed(2) });
        setMapLoading(false);
      }, 700);
    };

    const handleGenerateSignature = () => {
      if (!selected) return;
      setSignature({ code: `SIG-${Math.random().toString(36).substr(2, 12).toUpperCase()}`, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), by: 'Delivery Agent', condition: 'Good Condition' });
    };

    const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const SortIcon = ({ col }) => (
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" style={{ marginLeft: 3, opacity: sortCol === col ? 1 : 0.5, flexShrink: 0 }}>
        <path d="M8 3l3 4H5l3-4z" fill={sortCol === col && sortDir === 'asc' ? 'white' : 'rgba(255,255,255,0.6)'} />
        <path d="M8 13l3-4H5l3 4z" fill={sortCol === col && sortDir === 'desc' ? 'white' : 'rgba(255,255,255,0.6)'} />
      </svg>
    );

    const c = {
      page: { flex: 1, overflowY: 'auto', backgroundColor: '#f4f1fb', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", minHeight: '100vh' },
      header: { background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px' },
      title: { fontSize: '24px', fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px', margin: '0 0 3px 0' },
      subtitle: { fontSize: '13px', color: '#888', margin: 0 },
      bc: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' },
      bcItem: { fontSize: '12px', color: '#999', fontWeight: 500 },
      bcActive: { fontSize: '12px', color: '#390955', fontWeight: 700 },
      bcSep: { fontSize: '12px', color: '#ddd' },
      filterBar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 32px', background: 'white', borderBottom: '1px solid #ede8f8' },
      filterLabel: { fontSize: '11px', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.6px', marginRight: '4px' },
      filterBtn: (a) => ({ padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${a ? '#390955' : '#e0d5f0'}`, background: a ? '#390955' : 'white', color: a ? 'white' : '#555', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }),
      body: { padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' },
      card: { background: 'white', borderRadius: '14px', border: '1px solid #ebe4f5', boxShadow: '0 2px 12px rgba(57,9,85,0.06)', overflow: 'hidden' },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1.5px solid #f5f0ff' },
      cardTitle: { fontSize: '13px', fontWeight: 700, color: '#1a1a1a' },
      ico: { width: '26px', height: '26px', background: '#390955', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      badge: (solid) => ({ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: solid ? '#390955' : '#f0eaf8', color: solid ? 'white' : '#390955' }),
      actionBtn: (disabled, outline) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px 16px', background: disabled ? '#ede8f5' : outline ? 'white' : '#390955', color: disabled ? '#bbadd0' : outline ? '#390955' : 'white', border: outline && !disabled ? '2px solid #390955' : 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%', fontFamily: 'inherit' }),
      emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 16px', background: '#faf8ff', border: '1.5px dashed #d4c8e8', borderRadius: '10px', textAlign: 'center' },
      dl: { fontSize: '10px', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' },
      dv: { fontSize: '12px', color: '#1a1a1a', fontWeight: 700 },
    };

    // Column definitions with explicit widths so nothing gets squeezed
    const COLS = [
      { label: 'Parcel ID', col: 'id',       width: '90px'  },
      { label: 'Receiver',  col: 'receiver', width: '120px' },
      { label: 'Sender',    col: 'sender',   width: '150px' },
      { label: 'Contents',  col: 'contents', width: '130px' },
      { label: 'Weight',    col: 'weight',   width: '70px'  },
      { label: 'Value',     col: 'value',    width: '80px'  },
      { label: 'Service',   col: 'service',  width: '90px'  },
      { label: 'Date',      col: 'date',     width: '80px'  },
    ];

    return (
      <div style={c.page}>
        <style>{`
          @keyframes gpcs-spin { to { transform: rotate(360deg); } }
          @keyframes gpcs-modal-in { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
          @keyframes gpcs-slide-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }

          .gpcs-tr:hover td { background: #fff4ec !important; }
          .gpcs-tr.sel td { background: #f37021 !important; color: white !important; }
          .gpcs-tr.sel td * { color: white !important; opacity: 1 !important; }
          .gpcs-th:hover { background: #4d0c72 !important; color: white !important; }

          .gpcs-view-btn {
            transition: all 0.15s;
            white-space: nowrap;
          }
          .gpcs-view-btn:hover {
            background: #f37021 !important;
            color: white !important;
            border-color: #f37021 !important;
          }
          .gpcs-view-btn:hover svg { stroke: white !important; }

          .gpcs-search:focus { border-color: #390955 !important; box-shadow: 0 0 0 3px rgba(57,9,85,0.1) !important; outline: none; }
          .gpcs-clear:hover { background: #c4a8d8 !important; }

          /* Scrollable table wrapper */
          .gpcs-table-wrap {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .gpcs-table-wrap table {
            width: 100%;
            min-width: 820px;
            border-collapse: collapse;
            font-size: 13px;
            table-layout: fixed;
          }
          /* Action column always visible & never clipped */
          .gpcs-action-col {
            width: 90px;
            min-width: 90px;
            text-align: center;
            padding: 10px 12px !important;
          }
        `}</style>

        {viewModal && <ParcelModal parcel={viewModal} onClose={() => setViewModal(null)} onSelect={(id) => { setViewModal(null); handleSelect(id); }} />}

        {/* ── Header ── */}
        <header style={c.header}>
          <h1 style={c.title}>Generate Parcel Confirmation Status</h1>
          <p style={c.subtitle}>Verify, confirm, and track delivery status with live GPS &amp; geofence</p>
          <nav style={c.bc}>
            <span style={c.bcItem}>Dashboard</span><span style={{ fontSize: '12px', color: '#ddd' }}>/</span>
            <span style={c.bcItem}>Parcel Information Management</span><span style={{ fontSize: '12px', color: '#ddd' }}>/</span>
            <span style={c.bcActive}>Generate Parcel Confirmation Status</span>
          </nav>
        </header>

        {/* ── Filter Bar ── */}
        <div style={c.filterBar}>
          <span style={c.filterLabel}>Filter:</span>
          {FILTERS.map(f => {
            const count = filteredParcels(f).length;
            const isActive = activeFilter.key === f.key;
            return (
              <button key={f.key} style={c.filterBtn(isActive)} onClick={() => handleFilterChange(f)}>
                {f.label}
                <span style={{ fontSize: '10px', fontWeight: 700, marginLeft: '5px', padding: '1px 6px', borderRadius: '8px', background: isActive ? 'rgba(255,255,255,0.2)' : '#f0eaf8', color: isActive ? 'white' : '#390955' }}>{count}</span>
              </button>
            );
          })}
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#aaa' }}>
            <strong style={{ color: '#390955' }}>{visible.length}</strong> of <strong style={{ color: '#555' }}>{MOCK_PARCELS.length}</strong> parcels
          </div>
        </div>

        <div style={c.body}>

          {/* ══ PARCEL TABLE ══ */}
          <div style={c.card}>
            <div style={c.cardHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ ...c.ico, background: '#f37021' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                </div>
                <div>
                  <div style={c.cardTitle}>Parcel Information</div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '1px' }}>Click <strong style={{ color: '#390955' }}>View</strong> for full details · Click any row to load GPS &amp; confirmation</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selected && <span style={c.badge(true)}>● {selected} active</span>}
                <span style={c.badge(false)}>{sortedVisible.length} shown</span>
              </div>
            </div>

            {/* Search */}
            <div style={{ padding: '12px 20px', background: '#fdfcff', borderBottom: '1px solid #f5f0ff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="2" width="15" height="15" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
                </svg>
                <input
                  className="gpcs-search"
                  type="text"
                  placeholder="Search by ID, receiver, sender, contents…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '9px 36px 9px 36px', border: '1.5px solid #e0d5f0', borderRadius: '8px', fontSize: '13px', color: '#1a1a1a', background: 'white', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                />
                {searchQuery && (
                  <button className="gpcs-clear" onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)', width: '19px', height: '19px', borderRadius: '50%', border: 'none', background: '#d4c8e8', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, transition: 'background 0.15s' }}>✕</button>
                )}
              </div>
              {searchQuery && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: sortedVisible.length === 0 ? '#c2410c' : '#390955', background: sortedVisible.length === 0 ? '#fff7ed' : '#f0eaf8', padding: '4px 10px', borderRadius: '20px' }}>
                  {sortedVisible.length === 0 ? 'No matches' : `${sortedVisible.length} match${sortedVisible.length !== 1 ? 'es' : ''}`}
                </span>
              )}
            </div>

            {/* ── TABLE WRAPPER (scrollable) ── */}
            <div className="gpcs-table-wrap">
              <table>
                <colgroup>
                  {COLS.map(({ col, width }) => <col key={col} style={{ width }} />)}
                  {/* Action col — fixed 90px, never shrinks */}
                  <col style={{ width: '90px' }} />
                </colgroup>

                <thead>
                  <tr style={{ background: '#390955', borderBottom: '2px solid #2a0640' }}>
                    {COLS.map(({ label, col }) => (
                      <th
                        key={col}
                        className="gpcs-th"
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '12px 14px',
                          textAlign: 'left',
                          fontWeight: 700,
                          fontSize: '11px',
                          color: 'white',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          whiteSpace: 'nowrap',
                          borderBottom: sortCol === col ? '2px solid #f37021' : '2px solid transparent',
                          cursor: 'pointer',
                          userSelect: 'none',
                          background: sortCol === col ? '#4d0c72' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {label}
                          <SortIcon col={col} />
                        </span>
                      </th>
                    ))}
                    {/* Action header */}
                    <th className="gpcs-action-col" style={{
                      padding: '12px 14px',
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: '11px',
                      color: 'white',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      background: 'transparent',
                      whiteSpace: 'nowrap',
                    }}>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedVisible.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '48px 20px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="#d4c8e8" strokeWidth="1.5" width="36" height="36"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                          <span style={{ fontSize: '13px', color: '#bbb' }}>{searchQuery ? `No parcels match "${searchQuery}"` : 'No parcels in this time range'}</span>
                          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ fontSize: '12px', color: '#390955', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>Clear search</button>}
                        </div>
                      </td>
                    </tr>
                  ) : sortedVisible.map((p) => {
                    const isSel = selected === p.id;
                    const svc = SERVICE_STYLE[p.service] || SERVICE_STYLE.Standard;

                    return (
                      <tr
                        key={p.id}
                        className={`gpcs-tr${isSel ? ' sel' : ''}`}
                        onClick={() => handleSelect(p.id)}
                        style={{ borderBottom: '1px solid #f5f0ff', cursor: 'pointer' }}
                      >
                        {/* Parcel ID */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: isSel ? 'white' : '#390955', fontFamily: 'monospace' }}>{p.id}</span>
                        </td>
                        {/* Receiver */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ fontWeight: 600, color: isSel ? 'white' : '#1a1a1a' }}>{p.receiver}</span>
                        </td>
                        {/* Sender */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: isSel ? 'rgba(255,255,255,0.9)' : '#555' }}>{p.sender}</span>
                        </td>
                        {/* Contents */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: isSel ? 'rgba(255,255,255,0.9)' : '#555' }}>{p.contents}</span>
                        </td>
                        {/* Weight */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 700, color: isSel ? 'white' : '#1a1a1a' }}>{p.weight}</span>
                        </td>
                        {/* Value */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 700, color: isSel ? 'white' : '#1a1a1a' }}>{p.value}</span>
                        </td>
                        {/* Service badge */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '5px',
                            background: isSel ? 'rgba(255,255,255,0.25)' : svc.bg,
                            color: isSel ? 'white' : svc.color,
                            border: `1px solid ${isSel ? 'rgba(255,255,255,0.4)' : svc.border}`,
                            display: 'inline-block',
                          }}>{p.service}</span>
                        </td>
                        {/* Date */}
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '12px', color: isSel ? 'rgba(255,255,255,0.85)' : '#888' }}>{fmtDate(p.date)}</span>
                        </td>
                        {/* ── Action — always fully visible ── */}
                        <td
                          className="gpcs-action-col"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            className="gpcs-view-btn"
                            onClick={e => { e.stopPropagation(); setViewModal(p); }}
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: `1.5px solid ${isSel ? 'rgba(255,255,255,0.7)' : '#390955'}`,
                              background: isSel ? 'rgba(255,255,255,0.15)' : 'white',
                              color: isSel ? 'white' : '#390955',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 20px', borderTop: '1px solid #f5f0ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#faf8ff' }}>
              <span style={{ fontSize: '11px', color: '#aaa' }}>
                Showing <strong style={{ color: '#390955' }}>{sortedVisible.length}</strong> of <strong style={{ color: '#555' }}>{visible.length}</strong> parcels
                {searchQuery && <span style={{ color: '#390955' }}> · "{searchQuery}"</span>}
              </span>
              <span style={{ fontSize: '11px', color: '#aaa' }}>Click column to sort · Click row to load GPS</span>
            </div>
          </div>

          {/* ══ GPS + CONFIRMATION ══ */}
          {parcelInfo && (
            <div ref={detailRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', animation: 'gpcs-slide-up 0.28s ease both' }}>

              {/* GPS */}
              <div style={c.card}>
                <div style={c.cardHead}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ ...c.ico, background: '#f37021' }}><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                    <div>
                      <div style={c.cardTitle}>Live GPS &amp; Geofence</div>
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '1px' }}>{parcelInfo.id} · {parcelInfo.receiver}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    {gps && !mapLoading && <span style={c.badge(false)}>● Live</span>}
                    {mapLoading && <span style={{ fontSize: '11px', color: '#390955', fontWeight: 700 }}>Locating…</span>}
                    <button onClick={() => setViewModal(parcelInfo)} style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', border: '1.5px solid #e0d5f0', background: 'white', color: '#390955', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="11" height="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Details
                    </button>
                  </div>
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {mapLoading ? (
                    <div style={c.emptyBox}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="2" width="28" height="28" style={{ animation: 'gpcs-spin 1s linear infinite' }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round" stroke="#390955"/></svg>
                      <p style={{ fontSize: '12px', color: '#bbb', margin: 0 }}>Acquiring GPS signal…</p>
                    </div>
                  ) : gps ? (
                    <>
                      <MiniMap parcel={parcelInfo} gps={gps} geofence={geofence} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {[['Latitude', `${gps.lat.toFixed(5)}° N`], ['Longitude', `${Math.abs(gps.lng).toFixed(5)}° W`], ['Accuracy', `±${gps.accuracy} m`], ['Satellites', `${gps.satellites} locked`]].map(([l, v]) => (
                          <div key={l} style={{ background: '#faf8ff', border: '1px solid #e8e0f5', borderRadius: '8px', padding: '9px 11px' }}>
                            <div style={c.dl}>{l}</div>
                            <strong style={{ fontSize: '12px', fontWeight: 800, color: '#390955', fontFamily: 'Courier New, monospace' }}>{v}</strong>
                          </div>
                        ))}
                      </div>
                      {geofence && (
                        <div style={{ background: geofence.inside ? '#f37021' : 'white', border: `1.5px solid ${geofence.inside ? '#f37021' : '#e8e0f5'}`, borderRadius: '9px', padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: geofence.inside ? 'white' : '#390955' }}>{geofence.status}</div>
                            <div style={{ fontSize: '10px', color: geofence.inside ? 'rgba(255,255,255,0.7)' : '#aaa', marginTop: '2px' }}>{geofence.zone} · r={geofence.radius}km · d={geofence.distance}km</div>
                          </div>
                          <span style={{ fontSize: '22px' }}>{geofence.inside ? '' : '⚠️'}</span>
                        </div>
                      )}
                      <button style={c.actionBtn(false)} onClick={handleRefreshGPS}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="13" height="13"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        Refresh GPS &amp; Geofence
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Confirmation */}
              <div style={c.card}>
                <div style={c.cardHead}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ ...c.ico, background: '#f37021' }}><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></div>
                    <div>
                      <div style={c.cardTitle}>Delivery Confirmation &amp; Signature</div>
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '1px' }}>{confirmCode}</div>
                    </div>
                  </div>
                  {signature && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: '#f37021', color: 'white' }}>✓ Confirmed</span>}
                </div>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <button style={c.actionBtn(false, true)} onClick={handleGenerateSignature}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="2" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
                    {signature ? 'Re-generate Signature' : 'Generate Delivery Signature'}
                  </button>
                  {!signature ? (
                    <div style={c.emptyBox}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="1.5" width="40" height="40"><polyline points="20 6 9 17 4 12"/></svg>
                      <p style={{ fontSize: '12px', color: '#bbb', margin: 0 }}>Click above to generate a delivery signature for <strong style={{ color: '#390955' }}>{parcelInfo.id}</strong></p>
                    </div>
                  ) : (
                    <>
                      <div style={{ background: '#f37021', borderRadius: '12px', padding: '18px', color: 'white', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.75 }}>Delivery Signature</div>
                        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'Courier New, monospace', letterSpacing: '1px', background: 'rgba(255,255,255,0.15)', padding: '10px 13px', borderRadius: '7px', wordBreak: 'break-all' }}>{signature.code}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          {[['Delivered By', signature.by], ['Time', signature.time], ['Date', signature.date], ['Condition', signature.condition]].map(([l, v]) => (
                            <div key={l}>
                              <div style={{ fontSize: '10px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>{l}</div>
                              <strong style={{ fontSize: '12px' }}>{v}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: '#faf8ff', border: '1.5px solid #e8e0f5', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1.5px solid #f0eaf8' }}>Delivery Summary</div>
                        {[
                          ['Parcel ID',      parcelInfo.id,          false],
                          ['Tracking',       parcelInfo.trackingNumber, true],
                          ['Sender',         parcelInfo.sender,       false],
                          ['Receiver',       parcelInfo.receiver,     false],
                          ['Address',        parcelInfo.address,      false],
                          ['GPS',            gps ? `${gps.lat.toFixed(4)}°N, ${Math.abs(gps.lng).toFixed(4)}°W` : 'N/A', true],
                          ['Geofence',       geofence?.status ?? 'N/A', false],
                          ['Confirmation',   confirmCode,             true],
                          ['Signature Code', signature.code,          true],
                        ].map(([l, v, mono]) => (
                          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', fontSize: '12px', color: '#666', borderBottom: '1px solid #f0eaf8', gap: '8px' }}>
                            <span style={{ flexShrink: 0 }}>{l}</span>
                            <strong style={{ color: '#1a1a1a', textAlign: 'right', wordBreak: 'break-word', fontFamily: mono ? 'Courier New, monospace' : 'inherit', fontSize: '11px', maxWidth: '60%' }}>{v}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!parcelInfo && (
            <div style={{ ...c.emptyBox, padding: '60px 24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#c4a8d8" strokeWidth="1.5" width="52" height="52"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              <p style={{ fontSize: '14px', color: '#bbb', margin: 0 }}>Click <strong style={{ color: '#390955' }}>View</strong> to inspect a parcel, or click any row to load GPS &amp; confirmation</p>
            </div>
          )}
        </div>
      </div>
    );
  }