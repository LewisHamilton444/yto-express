'use client';
import React, { useState } from 'react';

const SELLER_PARCELS = [
  { id: 'PKG-S-2025-001', sender: 'Tech Store Pro',       receiver: 'Maria Santos',  address: '123 Rizal St, Manila',      weight: '2.5 kg', service: 'Express',   registeredDate: '2025-02-15', status: 'In Transit' },
  { id: 'PKG-S-2025-002', sender: 'Fashion Outlet',       receiver: 'Jose Reyes',    address: '456 Mabini Ave, Makati',    weight: '1.2 kg', service: 'Standard',  registeredDate: '2025-02-15', status: 'Out for Delivery' },
  { id: 'PKG-S-2025-003', sender: 'Electronics Hub',      receiver: 'Ana Cruz',      address: '789 Quezon Blvd, QC',      weight: '3.8 kg', service: 'Overnight', registeredDate: '2025-02-14', status: 'Picked Up' },
  { id: 'PKG-S-2025-004', sender: 'Books & More',         receiver: 'Carlo Mendoza', address: '12 Taft Ave, Pasay',        weight: '0.9 kg', service: 'Standard',  registeredDate: '2025-02-14', status: 'Pending' },
  { id: 'PKG-S-2025-005', sender: 'Tech Store Pro',       receiver: 'Liza Soriano',  address: '88 Shaw Blvd, Mandaluyong', weight: '1.7 kg', service: 'Express',   registeredDate: '2025-02-13', status: 'Delivered' },
];

const CUSTOMER_PARCELS = [
  { id: 'PKG-C-2025-001', sender: 'Ramon Villanueva',  receiver: 'Grace Tan',       address: '55 Ortigas Ave, Pasig',    weight: '1.0 kg', service: 'Standard',  registeredDate: '2025-02-15', status: 'In Transit' },
  { id: 'PKG-C-2025-002', sender: 'Jenny Pascual',     receiver: 'Mark Aquino',     address: '23 España Blvd, Manila',   weight: '0.5 kg', service: 'Express',   registeredDate: '2025-02-15', status: 'Pending' },
  { id: 'PKG-C-2025-003', sender: 'Roberto Flores',    receiver: 'Diana Castillo',  address: '101 Katipunan Ave, QC',    weight: '2.1 kg', service: 'Overnight', registeredDate: '2025-02-14', status: 'Delivered' },
  { id: 'PKG-C-2025-004', sender: 'Marivic Santos',    receiver: 'Paolo Gutierrez', address: '77 EDSA, Mandaluyong',     weight: '0.8 kg', service: 'Standard',  registeredDate: '2025-02-13', status: 'Out for Delivery' },
];

const STATUS_COLORS = {
  'Delivered':        { bg: '#d1fae5', color: '#065f46' },
  'In Transit':       { bg: '#e0f2fe', color: '#075985' },
  'Out for Delivery': { bg: '#fef3c7', color: '#92400e' },
  'Picked Up':        { bg: '#ede9fe', color: '#4c1d95' },
  'Pending':          { bg: '#f3f4f6', color: '#374151' },
};

const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS['Pending'];
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: c.bg, color: c.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {status}
    </span>
  );
};

const ParcelTable = ({ parcels, type }) => {
  const [search, setSearch] = useState('');

  const filtered = parcels.filter(p =>
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    p.sender.toLowerCase().includes(search.toLowerCase()) ||
    p.receiver.toLowerCase().includes(search.toLowerCase()) ||
    p.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e8e0f0', boxShadow: '0 2px 8px rgba(57,9,85,0.05)', overflow: 'hidden' }}>
      {/* Panel Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1.5px solid #f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: '#f37021', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {type === 'seller' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
              Parcels Registered by {type === 'seller' ? 'Sellers' : 'Customers'}
            </h2>
            <p style={{ fontSize: '11px', color: '#888', margin: 0, marginTop: '1px' }}>
              {filtered.length} of {parcels.length} records
            </p>
          </div>
        </div>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" width="14" height="14"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search parcels..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '32px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', border: '1.5px solid #e0d5f0', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', color: '#1a1a1a', outline: 'none', width: '200px', background: '#faf9ff' }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#390955' }}>
              {['Parcel ID', 'Registered By', 'Receiver', 'Delivery Address', 'Weight', 'Service', 'Date Registered', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'white', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((p, idx) => (
              <tr key={p.id} style={{ background: idx % 2 === 0 ? 'white' : '#faf9ff', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0eaf8'}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#faf9ff'}
              >
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#390955', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.id}</td>
                <td style={{ padding: '12px 16px', color: '#1a1a1a', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.sender}</td>
                <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.receiver}</td>
                <td style={{ padding: '12px 16px', color: '#666', borderBottom: '1px solid #f3f0f8', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</td>
                <td style={{ padding: '12px 16px', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8', textAlign: 'center' }}>{p.weight}</td>
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: '#f0eaf8', color: '#390955' }}>{p.service}</span>
                </td>
                <td style={{ padding: '12px 16px', color: '#666', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}>{p.registeredDate}</td>
                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f0f8' }}><StatusBadge status={p.status} /></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                  No parcels found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid #f0eaf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#aaa' }}>Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['Delivered', 'In Transit', 'Pending'].map(s => (
            <span key={s} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: STATUS_COLORS[s]?.bg, color: STATUS_COLORS[s]?.color }}>
              {s}: {parcels.filter(p => p.status === s).length}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function GenerateParcelMovement() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f9f7ff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

      {/* Page Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.5px', margin: '0 0 4px 0' }}>
          View Registered Parcels
        </h1>
        <p style={{ fontSize: '13px', color: '#666', margin: '2px 0 0 0' }}>
          Browse parcels registered by sellers and customers
        </p>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px' }}>
          <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>Dashboard</span>
          <span style={{ fontSize: '12px', color: '#d4c8e8' }}>/</span>
          <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>Parcel Information Management</span>
          <span style={{ fontSize: '12px', color: '#d4c8e8' }}>/</span>
          <span style={{ fontSize: '12px', color: '#390955', fontWeight: 600 }}>View Registered Parcels</span>
        </nav>
      </header>

      {/* Content */}
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <ParcelTable parcels={SELLER_PARCELS}   type="seller" />
        <ParcelTable parcels={CUSTOMER_PARCELS} type="customer" />
      </div>

    </div>
  );
}