'use client';
import React, { useState, useEffect } from 'react';
import { normalizeRider, mockRiders, formatStatusLabel, RIDER_STATUS } from './sellerRiderData';
import PaginationControls from './PaginationControls';
import { exportToCSV, exportToExcel } from './exportUtils';
import ParcelProgressTimeline from './ParcelProgressTimeline';

const RIDER_EXPORT_COLUMNS = [
  { key: 'riderId', label: 'Rider ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'vehicleType', label: 'Vehicle Type' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
];

const vehicleIcon = (v) => {
  const type = String(v).toLowerCase();
  if (type.includes('e-bike')) return '⚡';
  if (type.includes('bicycle')) return '🚲';
  return '🛵';
};

function Stars({ rating }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} viewBox="0 0 24 24" width="12" height="12"
          fill={i <= Math.round(rating) ? '#f37021' : 'none'}
          stroke={i <= Math.round(rating) ? '#f37021' : '#ddd'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
      <span style={{ fontSize: 11, fontWeight: 700, color: '#555', marginLeft: 4 }}>{rating}</span>
    </div>
  );
}

const STATUS_BADGE = {
  ACTIVE:               { bg: '#390955', color: 'white',   border: 'none',              dot: '#a8ffb0' },
  PENDING_VERIFICATION: { bg: 'white',   color: '#390955',  border: '1.5px solid #390955', dot: '#f37021' },
  ARCHIVED:             { bg: '#7f8c8d', color: 'white',   border: 'none',              dot: '#ddd' },
};

// A rider is "on duty" whenever they're currently holding an in-progress
// parcel — there's no separate presence/heartbeat system, so this is the one
// real signal we have for whether someone is actively working right now.
const HELD_STATUSES   = ['pending', 'in-transit'];
const CLOSED_STATUSES = ['delivered', 'returned', 'failed'];
const ARCHIVE_AFTER_DAYS = 7;

const belongsToRider = (parcel, riderObj) => parcel.riderId === riderObj.riderId || parcel.riderId === riderObj._id;

// Delivered/returned/failed parcels auto-archive from the visible delivery
// history once they're more than 7 days past their last status update —
// computed on render, nothing is deleted or flagged in the database.
const isArchivedDelivery = (parcel) => {
  if (!parcel.updatedAt) return false;
  const ageDays = (Date.now() - new Date(parcel.updatedAt).getTime()) / 86400000;
  return ageDays > ARCHIVE_AFTER_DAYS;
};

export default function GenerateRiderDataReport() {
  const [filters,      setFilters]      = useState({ riderName: '', riderId: '', status: 'all', vehicleType: 'all', duty: 'all', area: '', dateFrom: '', dateTo: '' });
  const [currentPage,  setCurrentPage]  = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [selectedRider,setSelectedRider]= useState(null);
  const [editingRider, setEditingRider] = useState(null);
  const [riders,       setRiders]       = useState([]);
  const [parcels,      setParcels]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saveMsg,      setSaveMsg]      = useState('');
  const [saveErr,      setSaveErr]      = useState('');
  const [showArchivedDeliveries, setShowArchivedDeliveries] = useState(false);
  const [viewParcel,   setViewParcel]   = useState(null);

  const fetchRiders = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/riders');
      const data = await response.json();
      setRiders(data.map(normalizeRider));
    } catch (err) {
      console.error('Error fetching riders:', err);
      setRiders(mockRiders);
    } finally {
      setLoading(false);
    }
  };

  const fetchParcels = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/parcels');
      const data = await response.json();
      setParcels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching parcels:', err);
      setParcels([]);
    }
  };

  useEffect(() => { fetchRiders(); fetchParcels(); }, []);

  const getHeldParcels   = (riderObj) => parcels.filter(p => HELD_STATUSES.includes(p.status) && belongsToRider(p, riderObj));
  const getClosedParcels = (riderObj) => parcels.filter(p => CLOSED_STATUSES.includes(p.status) && belongsToRider(p, riderObj));
  const isOnDuty         = (riderObj) => getHeldParcels(riderObj).length > 0;

  // ── Save edit to MongoDB ──
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setSaveMsg(''); setSaveErr('');
    try {
      const updateData = {
        riderName:     editingRider.fullName,
        phone:         editingRider.phone,
        vehicleType:   editingRider.vehicleType,
        city:          editingRider.location.city,
        licenseNumber: editingRider.driverLicenseNumber,
        vehiclePlate:  editingRider.vehiclePlateNumber,
        bankName:      editingRider.bankName,
        payoutRate:    editingRider.payoutCommissionShare,
        payoutCycle:   editingRider.payoutCycle,
      };

      const response = await fetch(`http://localhost:3001/api/riders/${editingRider._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to save');

      setSaveMsg('Saved successfully!');
      await fetchRiders();
      setTimeout(() => { setEditingRider(null); setSaveMsg(''); }, 800);
    } catch (err) {
      console.error('Error saving:', err);
      setSaveErr('Failed to save. Check backend.');
    }
  };

  const handleOpenEdit = (riderObj, e) => {
    if (e) e.stopPropagation();
    setEditingRider({ ...riderObj, location: { ...riderObj.location } });
    setSaveMsg(''); setSaveErr('');
  };

  const handleExportCSV = () => exportToCSV(filteredData, RIDER_EXPORT_COLUMNS, 'riders-ledger');
  const handleExportExcel = () => exportToExcel(filteredData, RIDER_EXPORT_COLUMNS, 'riders-ledger');

  // Archived riders live in Settings > Archived Records now, not here.
  const filteredData  = riders.filter(r => {
    if (r.status === RIDER_STATUS.ARCHIVED) return false;
    if (filters.riderId   && !r.riderId.toLowerCase().includes(filters.riderId.toLowerCase()))     return false;
    if (filters.riderName && !r.fullName.toLowerCase().includes(filters.riderName.toLowerCase())) return false;
    if (filters.status !== 'all' && r.status !== filters.status)                              return false;
    if (filters.vehicleType !== 'all' && r.vehicleType !== filters.vehicleType)                return false;
    if (filters.duty === 'active' && !isOnDuty(r))                                             return false;
    if (filters.duty === 'inactive' && isOnDuty(r))                                             return false;
    if (filters.area && !r.location.city.toLowerCase().includes(filters.area.toLowerCase()))           return false;
    return true;
  });

  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleFilterChange = (field, value) => { setFilters(p => ({ ...p, [field]: value })); setCurrentPage(1); };
  const handleReset = () => { setFilters({ riderName: '', riderId: '', status: 'all', vehicleType: 'all', duty: 'all', area: '', dateFrom: '', dateTo: '' }); setCurrentPage(1); };

  const rider = selectedRider ? riders.find(r => r.riderId === selectedRider) : null;
  const riderHeldParcels   = rider ? getHeldParcels(rider) : [];
  const riderClosedParcels = rider ? getClosedParcels(rider) : [];
  const riderArchivedCount = riderClosedParcels.filter(isArchivedDelivery).length;
  const riderVisibleClosedParcels = showArchivedDeliveries ? riderClosedParcels : riderClosedParcels.filter(p => !isArchivedDelivery(p));

  const th = { padding: '13px 16px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap', background: '#390955', position: 'sticky', top: 0 };
  const td = { padding: '13px 16px', borderBottom: '1px solid #f0eaf8', color: '#1a1a1a', verticalAlign: 'middle' };

  return (
    <div style={{ flex: 1, background: '#f9f7ff', overflowY: 'auto', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`.hrow:hover td { background: #faf5ff !important; }`}</style>

      <header style={{ background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', letterSpacing: -0.5, margin: '0 0 4px 0' }}>Generate Rider Data Report</h1>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>View and manage rider performance data · Archiving is managed in Settings &gt; Archived Records</p>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {['Dashboard', 'Rider Information Management', selectedRider ? 'Rider Profile Info' : 'Generate Rider Data Report'].map((b, i, arr) => (
            <React.Fragment key={b}>
              <span style={{ fontSize: 12, color: i === arr.length - 1 ? '#390955' : '#888', fontWeight: i === arr.length - 1 ? 700 : 500, cursor: i < arr.length - 1 ? 'pointer' : 'default' }}
                onClick={() => { if (i === 1) setSelectedRider(null); }}>
                {b}
              </span>
              {i < arr.length - 1 && <span style={{ fontSize: 12, color: '#d4c8e8' }}>/</span>}
            </React.Fragment>
          ))}
        </nav>
      </header>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!selectedRider ? (
          <>
            {/* Filters */}
            <div style={{ background: 'white', border: '1px solid #e0d5f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 1px 6px rgba(57,9,85,0.05)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#f37021', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                </div>
                Report Filters
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginBottom: 18 }}>
                {[{ label:'Rider Name', key:'riderName', type:'text', ph:'Search by name' }, { label:'Rider ID', key:'riderId', type:'text', ph:'e.g. RD-...' }].map(f => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.4 }}>{f.label}</label>
                    <input type={f.type} placeholder={f.ph} value={filters[f.key]} onChange={e => handleFilterChange(f.key, e.target.value)}
                      style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
                  </div>
                ))}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.4 }}>Vehicle Type</label>
                  <select value={filters.vehicleType} onChange={e => handleFilterChange('vehicleType', e.target.value)}
                    style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}>
                    <option value="all">All Vehicles</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="Van">Van</option>
                    <option value="Bicycle">Bicycle</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.4 }}>Status</label>
                  <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}
                    style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}>
                    <option value="all">All Status</option>
                    <option value={RIDER_STATUS.ACTIVE}>Active</option>
                    <option value={RIDER_STATUS.PENDING_VERIFICATION}>Pending Verification</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.4 }}>On Duty</label>
                  <select value={filters.duty} onChange={e => handleFilterChange('duty', e.target.value)}
                    style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}>
                    <option value="all">Active or Inactive</option>
                    <option value="active">Active (holding a shipment)</option>
                    <option value="inactive">Inactive (no shipment)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.4 }}>City</label>
                  <input type="text" placeholder="e.g. Quezon City" value={filters.area} onChange={e => handleFilterChange('area', e.target.value)}
                    style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.4 }}>Date From</label>
                  <input type="date" value={filters.dateFrom} onChange={e => handleFilterChange('dateFrom', e.target.value)}
                    style={{ padding: '9px 12px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCurrentPage(1)} style={{ padding: '10px 22px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: '#390955', color: 'white' }}>Retrieve Report</button>
                <button onClick={handleReset} style={{ padding: '10px 22px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#555' }}>Reset Filters</button>
              </div>
            </div>

            {/* Table */}
            <div style={{ background: 'white', border: '1px solid #e0d5f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 10px rgba(57,9,85,0.05)' }}>
              <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>Rider Records</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#f0eaf8', color: '#390955' }}>{filteredData.length} results</span>
                  <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>● {riders.filter(r=>r.status===RIDER_STATUS.ACTIVE).length} active on map</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={handleExportCSV} style={{ padding: '6px 12px', border: '1.5px solid #e0d5f0', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#390955' }}>Export CSV</button>
                  <button onClick={handleExportExcel} style={{ padding: '6px 12px', border: '1.5px solid #e0d5f0', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#390955' }}>Export Excel</button>
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#a890c0', fontWeight: 600 }}>Loading riders from database...</div>
              ) : filteredData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#a890c0', fontWeight: 600 }}>No riders found.</div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Rider ID','Rider Name','Vehicle Type','City','Deliveries Completed','Rating','On Duty','Status','Actions'].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedData.map((r, i) => {
                        const badge = STATUS_BADGE[r.status] || STATUS_BADGE.ACTIVE;
                        const onDuty = isOnDuty(r);
                        return (
                        <tr key={r.riderId} className="hrow" onClick={() => setSelectedRider(r.riderId)}
                          style={{ cursor: 'pointer', ...(i%2===0 ? {} : { background: 'rgba(57,9,85,0.015)' }) }}>
                          <td style={{ ...td, fontWeight: 700, color: '#390955', fontFamily: 'monospace', fontSize: 11 }}>{r.riderId}</td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff4ec', border: '2px solid #f37021', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{vehicleIcon(r.vehicleType)}</div>
                              <div style={{ fontWeight: 700, color: '#1a1a1a' }}>{r.fullName}</div>
                            </div>
                          </td>
                          <td style={td}><span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{r.vehicleType}</span></td>
                          <td style={td}><span style={{ fontSize: 12, fontWeight: 600, color: '#555', background: '#f5f0fc', padding: '3px 9px', borderRadius: 6 }}>{r.location.city}</span></td>
                          <td style={{ ...td, fontWeight: 700 }}>{r.performance.deliveriesCount}</td>
                          <td style={td}><Stars rating={r.performance.rating}/></td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                              background: onDuty ? '#e6f9ed' : '#f5f5f5', color: onDuty ? '#1e7e34' : '#888' }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: onDuty ? '#22c55e' : '#bbb' }}/>
                              {onDuty ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                              background: badge.bg, color: badge.color, border: badge.border }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.dot }}/>
                              {formatStatusLabel(r.status)}
                            </span>
                          </td>
                          <td style={td} onClick={e => e.stopPropagation()}>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedRider(r.riderId); }}
                                style={{ padding: '5px 10px', border: 'none', borderRadius: 6, background: '#390955', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                View →
                              </button>
                            </div>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ padding: '0 22px 16px', borderTop: '1px solid #f0eaf8', background: '#faf8ff' }}>
                <PaginationControls
                  currentPage={currentPage}
                  totalRecords={filteredData.length}
                  rowsPerPage={itemsPerPage}
                  rowsPerPageOptions={[8, 25, 50, 100]}
                  onPageChange={setCurrentPage}
                  onRowsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
                />
              </div>
            </div>
          </>
        ) : (
          /* PROFILE VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button onClick={() => setSelectedRider(null)}
              style={{ padding: '8px 16px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#390955', alignSelf: 'flex-start' }}>
              ← Back to Report Records
            </button>

            {rider && (
              <>
                <div style={{ background: 'linear-gradient(135deg,#390955,#5c1285)', borderRadius: 16, padding: '24px 28px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }}/>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f37021', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, boxShadow: '0 4px 18px rgba(243,112,33,0.4)', border: '3px solid rgba(255,255,255,0.3)' }}>{vehicleIcon(rider.vehicleType)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{rider.fullName}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>{rider.riderId} · {rider.vehicleType} · Joined {rider.joined}</div>
                      <div style={{ marginTop: 10 }}><Stars rating={rider.performance.rating}/></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: '#f37021', color: 'white' }}>
                        {formatStatusLabel(rider.status)}
                      </span>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{rider.location.city}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { label: 'Deliveries Completed', value: rider.performance.deliveriesCount, color: '#390955' },
                    { label: 'Rating',                value: rider.performance.rating,          color: '#f37021' },
                    { label: 'Status',                value: formatStatusLabel(rider.status),   color: '#390955' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 12, padding: '16px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 5 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 18px', borderBottom: '1px solid #f0eaf8' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>Personal Info</span>
                    </div>
                    <div style={{ padding: '4px 18px 12px' }}>
                      {[
                        ['Full Name',        rider.fullName],
                        ['Rider ID',         rider.riderId],
                        ['Phone',            rider.phone],
                        ['Email',            rider.email || '—'],
                        ['Vehicle Type',     rider.vehicleType],
                        ['Driver License No.', rider.driverLicenseNumber || '—'],
                        ['Plate No.',        rider.vehiclePlateNumber || '—'],
                        ['City',             rider.location.city],
                        ['Province',         rider.location.province || '—'],
                        ['Joined',           rider.joined],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 }}>
                          <span style={{ color: '#888', fontWeight: 500 }}>{k}</span>
                          <span style={{ color: '#1a1a1a', fontWeight: 700 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 18px', borderBottom: '1px solid #f0eaf8' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Info</span>
                    </div>
                    <div style={{ padding: '4px 18px 12px' }}>
                      {[
                        ['Account No.',            rider.accountNumber || '—'],
                        ['Bank Name',              rider.bankName || '—'],
                        ['Payout Commission Share',rider.payoutCommissionShare ? rider.payoutCommissionShare + '%' : '—'],
                        ['Payout Cycle',           rider.payoutCycle || '—'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 }}>
                          <span style={{ color: '#888', fontWeight: 500 }}>{k}</span>
                          <span style={{ color: '#1a1a1a', fontWeight: 700 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SHIPMENTS — held parcels + delivery history (auto-archives after 7 days) */}
                <div style={{ background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 18px', borderBottom: '1px solid #f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>Currently Held Shipments</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: riderHeldParcels.length ? '#e6f9ed' : '#f5f5f5', color: riderHeldParcels.length ? '#1e7e34' : '#888' }}>
                      {riderHeldParcels.length} held
                    </span>
                  </div>
                  {riderHeldParcels.length === 0 ? (
                    <div style={{ padding: '20px 18px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No shipments currently held.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>{['Tracking No.','Item','Destination','Status'].map(h => <th key={h} style={{ ...th, position: 'static' }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {riderHeldParcels.map(p => (
                            <tr key={p._id} className="hrow" onClick={() => setViewParcel(p)} style={{ cursor: 'pointer' }}>
                              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#390955' }}>{p.trackingNumber}</td>
                              <td style={td}>{p.item}</td>
                              <td style={td}>{p.destination || '—'}</td>
                              <td style={td}>{p.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div style={{ background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 18px', borderBottom: '1px solid #f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delivery History</span>
                    {riderArchivedCount > 0 && (
                      <button onClick={() => setShowArchivedDeliveries(v => !v)}
                        style={{ padding: '4px 10px', border: '1.5px solid #e0d5f0', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', fontFamily: 'inherit' }}>
                        {showArchivedDeliveries ? 'Hide' : 'Show'} archived ({riderArchivedCount}, 7+ days)
                      </button>
                    )}
                  </div>
                  {riderVisibleClosedParcels.length === 0 ? (
                    <div style={{ padding: '20px 18px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No past deliveries to show.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>{['Tracking No.','Item','Destination','Status','Updated'].map(h => <th key={h} style={{ ...th, position: 'static' }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {riderVisibleClosedParcels.map(p => {
                            const archived = isArchivedDelivery(p);
                            return (
                              <tr key={p._id} className="hrow" onClick={() => setViewParcel(p)} style={{ cursor: 'pointer', opacity: archived ? 0.55 : 1 }}>
                                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#390955' }}>{p.trackingNumber}</td>
                                <td style={td}>{p.item}</td>
                                <td style={td}>{p.destination || '—'}</td>
                                <td style={td}>
                                  {p.status}
                                  {archived && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#888' }}>· Archived</span>}
                                </td>
                                <td style={td}>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={(e) => handleOpenEdit(rider, e)}
                    style={{ padding: '11px 24px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: '#390955', color: 'white' }}>
                    Edit Profile Details
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingRider && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(26,10,36,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <form onSubmit={handleSaveEdit} style={{ width: 460, background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 12px 36px rgba(57,9,85,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #f0eaf8', background: '#390955' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>Edit Rider Profile</h3>
              <button type="button" onClick={() => setEditingRider(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>

            {saveMsg && <div style={{ background: '#d1fae5', color: '#065f46', padding: '10px 24px', fontSize: 13, fontWeight: 600 }}>✅ {saveMsg}</div>}
            {saveErr && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 24px', fontSize: 13, fontWeight: 600 }}>❌ {saveErr}</div>}

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Full Name</label>
                <input type="text" value={editingRider.fullName || ''} onChange={e => setEditingRider({ ...editingRider, fullName: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Phone</label>
                <input type="text" value={editingRider.phone || ''} onChange={e => setEditingRider({ ...editingRider, phone: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>City</label>
                <input type="text" value={editingRider.location.city || ''} onChange={e => setEditingRider({ ...editingRider, location: { ...editingRider.location, city: e.target.value } })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Driver License No.</label>
                <input type="text" value={editingRider.driverLicenseNumber || ''} onChange={e => setEditingRider({ ...editingRider, driverLicenseNumber: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Plate No.</label>
                <input type="text" value={editingRider.vehiclePlateNumber || ''} onChange={e => setEditingRider({ ...editingRider, vehiclePlateNumber: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Bank Name</label>
                <input type="text" value={editingRider.bankName || ''} onChange={e => setEditingRider({ ...editingRider, bankName: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Payout Commission Share (%)</label>
                <input type="number" value={editingRider.payoutCommissionShare ?? 0} onChange={e => setEditingRider({ ...editingRider, payoutCommissionShare: Number(e.target.value) })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Vehicle Type</label>
                <select value={editingRider.vehicleType} onChange={e => setEditingRider({ ...editingRider, vehicleType: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}>
                  <option>Motorcycle</option><option>Van</option><option>Bicycle</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Payout Cycle</label>
                <select value={editingRider.payoutCycle || 'Weekly'} onChange={e => setEditingRider({ ...editingRider, payoutCycle: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}>
                  <option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e0d5f0', background: '#faf9ff', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setEditingRider(null)}
                style={{ padding: '10px 20px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#555' }}>
                Cancel
              </button>
              <button type="submit"
                style={{ padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: '#390955', color: 'white' }}>
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PARCEL INFO MODAL */}
      {viewParcel && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(26,10,36,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setViewParcel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 12px 36px rgba(57,9,85,0.25)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #f0eaf8', background: '#390955' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>{viewParcel.trackingNumber}</h3>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>Parcel Info</p>
              </div>
              <button type="button" onClick={() => setViewParcel(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
              <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid #f0eaf8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Delivery Progress</div>
                <ParcelProgressTimeline parcel={viewParcel} />
              </div>

              {[
                ['Tracking Number', viewParcel.trackingNumber],
                ['Sender',          viewParcel.senderName],
                ['Receiver',        viewParcel.receiverName],
                ['Item',            viewParcel.item],
                ['Weight',          viewParcel.weight || '—'],
                ['Declared Value',  viewParcel.value || '—'],
                ['Origin',          viewParcel.origin || '—'],
                ['Destination',     viewParcel.destination || '—'],
                ['Status',          viewParcel.status],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 }}>
                  <span style={{ color: '#888', fontWeight: 500 }}>{k}</span>
                  <span style={{ color: '#1a1a1a', fontWeight: 700 }}>{v}</span>
                </div>
              ))}

              {viewParcel.events && viewParcel.events.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Tracking Events</div>
                  {viewParcel.events.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f0ff', fontSize: 12 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f37021', marginTop: 4, flexShrink: 0 }}/>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1a1a1a' }}>{ev.event}</div>
                        <div style={{ color: '#9b82b2', marginTop: 2 }}>{ev.time} · {ev.location}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e0d5f0', background: '#faf9ff', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setViewParcel(null)}
                style={{ padding: '10px 20px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#555' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
