import React, { useState, useEffect } from 'react';
import { normalizeRider, formatStatusLabel, RIDER_STATUS } from './sellerRiderData';
import PaginationControls from './PaginationControls';
import { exportToCSV, exportToExcel, exportToPDF, exportToWord } from './exportUtils';
import ExportDropdown from './components/ui/ExportDropdown';
import RefreshButton from './components/ui/RefreshButton';
import FilterBar from './components/ui/FilterBar';
import ParcelProgressTimeline from './ParcelProgressTimeline';
import { apiFetch, ridersApi, parcelsApi } from './services/api';
import Modal from './components/ui/Modal';
import PageHeader from './components/ui/PageHeader';
import SectionCard from './components/ui/SectionCard';
import CardSectionHeader from './components/ui/CardSectionHeader';
import { VehicleIcon } from './components/ui/vehicleIcons';
import { RIDER_STATUS_BADGE } from './components/ui/statusColors';
import StatusBadge from './components/ui/StatusBadge';
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Hash, User, Mail, Phone, Truck, Building2, Package, MapPin, Star, Zap, Activity, Calendar, RotateCcw } from 'lucide-react';
import EmptyState from './components/ui/EmptyState';
import TableSkeleton from './components/ui/TableSkeleton';

const RIDER_EXPORT_COLUMNS = [
  { key: 'riderId', label: 'Rider ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'vehicleInfo', label: 'Vehicle Info' },
  { key: 'hubAddress', label: 'Hub Address' },
  { key: 'deliveriesCompleted', label: 'Deliveries Completed' },
  { key: 'rating', label: 'Rating' },
  { key: 'dutyLabel', label: 'On Duty' },
  { key: 'status', label: 'Status' },
];

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

// On Duty used to be a plain Active/Inactive flag derived only from whether a
// rider is currently holding a parcel — which contradicted the account
// STATUS column whenever an approved (Active) rider simply wasn't carrying
// anything at that moment ("On Duty: Inactive" next to "Status: Active" reads
// like the account itself is disabled). These three states use the same two
// real signals we have (account status + held-parcel flag) without implying
// that, so the two columns never disagree:
//   Offline     — account isn't Active yet (pending verification)
//   On Delivery — Active and currently holding a pending/in-transit parcel
//   Online      — Active and free (approved, just not carrying anything)
// 2026-09-11 parity update: a third REAL signal now exists — the rider's
// own duty toggle from the Android profile tab (raw.isOnDuty, synced via the
// bridge). A rider who toggled Active in the app shows "On Duty" even when
// not currently holding a parcel; held-parcel state upgrades it to
// "On Delivery".
const DUTY_LABELS = { online: 'On Duty', 'on-delivery': 'On Delivery', offline: 'Off Duty' };
const DUTY_BADGE = {
  online:        { bg: '#e6f9ed', color: '#1e7e34', dot: '#22c55e' },
  'on-delivery': { bg: '#fff4ec', color: '#c2540d', dot: '#f37021' },
  offline:       { bg: '#f5f5f5', color: '#888',    dot: '#bbb'    },
};

// A rider is "holding" a shipment whenever they're currently carrying an
// in-progress parcel — there's no separate presence/heartbeat system, so this
// is the one real signal we have for whether someone is actively working
// right now.
const HELD_STATUSES   = ['pending', 'in-transit'];
const CLOSED_STATUSES = ['delivered', 'returned', 'failed'];
const ARCHIVE_AFTER_DAYS = 7;

const norm = (v) => String(v ?? '').trim().toLowerCase();
const belongsToRider = (parcel, riderObj) =>
  (!!parcel.riderId) && (norm(parcel.riderId) === norm(riderObj.riderId) || norm(parcel.riderId) === norm(riderObj._id));

// Delivered/returned/failed parcels auto-archive from the visible delivery
// history once they're more than 7 days past their last status update —
// computed on render, nothing is deleted or flagged in the database.
const isArchivedDelivery = (parcel) => {
  if (!parcel.updatedAt) return false;
  const ageDays = (Date.now() - new Date(parcel.updatedAt).getTime()) / 86400000;
  return ageDays > ARCHIVE_AFTER_DAYS;
};

export default function GenerateRiderDataReport() {
  const [searchTerm,   setSearchTerm]   = useState('');
  const [filters,      setFilters]      = useState({ vehicleType: 'all', duty: 'all', status: 'all' });
  const [currentPage,  setCurrentPage]  = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [selectedRider,setSelectedRider]= useState(null);
  const [editingRider, setEditingRider] = useState(null);
  const [riders,       setRiders]       = useState([]);
  const [parcels,      setParcels]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');
  const [saveErr,      setSaveErr]      = useState('');
  const [showArchivedDeliveries, setShowArchivedDeliveries] = useState(false);
  const [viewParcel,   setViewParcel]   = useState(null);

  const fetchRiders = async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const data = await ridersApi.list();
      // Guard: a non-array response would crash data.map below.
      setRiders((Array.isArray(data) ? data : []).map(normalizeRider));
    } catch (err) {
      console.error('Error fetching riders:', err);
      setRiders([]);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  const fetchParcels = async () => {
    try {
      const data = await parcelsApi.list();
      setParcels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching parcels:', err);
      setParcels([]);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([fetchRiders(true), fetchParcels()]);
  };

  useEffect(() => { fetchRiders(); fetchParcels(); }, []);

  // While a rider's profile is open, re-poll parcels so "Currently Held
  // Shipments" reflects what's actually scanned/active in their mobile app
  // session as it changes, instead of a one-time snapshot from page load.
  useEffect(() => {
    if (!selectedRider) return;
    const interval = setInterval(fetchParcels, 10000);
    return () => clearInterval(interval);
  }, [selectedRider]);

  const getHeldParcels   = (riderObj) => parcels.filter(p => HELD_STATUSES.includes(p.status) && belongsToRider(p, riderObj));
  const getClosedParcels = (riderObj) => parcels.filter(p => CLOSED_STATUSES.includes(p.status) && belongsToRider(p, riderObj));
  const isOnDuty         = (riderObj) => getHeldParcels(riderObj).length > 0;
  // Duty state now blends the real Android duty toggle (riderObj.isOnDuty,
  // synced live via the bridge) with the held-parcel signal: a rider who
  // flipped their profile toggle to Active shows "On Duty" immediately, and
  // carrying a parcel upgrades the badge to "On Delivery". No toggle data
  // (older records) keeps the previous parcel-derived behavior.
  const getDutyState     = (riderObj) => {
    if (riderObj.status !== RIDER_STATUS.ACTIVE) return 'offline';
    if (isOnDuty(riderObj)) return 'on-delivery';
    if (riderObj.isOnDuty || riderObj.raw?.isOnDuty === true) return 'online';
    return 'offline';
  };

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
        emergencyContactName:  editingRider.emergencyContactName,
        emergencyContactPhone: editingRider.emergencyContactPhone,
        bankName:      editingRider.bankName,
        payoutRate:    editingRider.payoutCommissionShare,
        payoutCycle:   editingRider.payoutCycle,
      };

      const response = await apiFetch(`/riders/${editingRider._id}`, {
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

  const getExportData = () => filteredData.map(r => ({
    riderId: r.riderId,
    fullName: r.fullName,
    email: r.email || '—',
    phone: r.phone || '—',
    vehicleInfo: `${r.vehicleType}${r.vehiclePlateNumber ? ` (${r.vehiclePlateNumber})` : ''}`,
    hubAddress: r.raw?.assignedHubAddress || r.raw?.address || (r.location.city ? `${r.location.city} Hub` : 'Pulilan Hub'),
    deliveriesCompleted: r.performance.deliveriesCount,
    rating: r.performance.rating,
    dutyLabel: DUTY_LABELS[getDutyState(r)],
    status: formatStatusLabel(r.status),
  }));

  const handleExport = (format) => {
    const data = getExportData();
    if (format === 'excel') {
      exportToExcel(data, RIDER_EXPORT_COLUMNS, 'riders-ledger');
    } else if (format === 'word') {
      exportToWord(data, RIDER_EXPORT_COLUMNS, 'riders-ledger', 'Rider Data Report');
    } else if (format === 'pdf') {
      exportToPDF(data, RIDER_EXPORT_COLUMNS, 'riders-ledger', 'Rider Data Report');
    } else {
      exportToCSV(data, RIDER_EXPORT_COLUMNS, 'riders-ledger');
    }
  };

  // Archived riders live in Settings > Archived Records now, not here.
  const filteredData = riders.filter(r => {
    if (r.status === RIDER_STATUS.ARCHIVED) return false;
    if (searchTerm) {
      const q = searchTerm.trim().toLowerCase();
      const riderId = (r.riderId || '').toLowerCase();
      const name = (r.fullName || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const phone = (r.phone || '').toLowerCase();
      const hub = (r.raw?.assignedHubAddress || r.raw?.address || r.location?.city || '').toLowerCase();
      const plate = (r.vehiclePlateNumber || '').toLowerCase();
      const vehicle = (r.vehicleType || '').toLowerCase();
      const matches = riderId.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q) || hub.includes(q) || plate.includes(q) || vehicle.includes(q);
      if (!matches) return false;
    }
    if (filters.vehicleType !== 'all' && r.vehicleType !== filters.vehicleType) return false;
    if (filters.duty !== 'all' && getDutyState(r) !== filters.duty) return false;
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    return true;
  });

  const isFiltered = searchTerm.trim() !== '' || filters.vehicleType !== 'all' || filters.duty !== 'all' || filters.status !== 'all';

  const maxPage = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const safePage = Math.min(currentPage, maxPage);
  const indexOfLastRecord  = safePage * itemsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - itemsPerPage;
  const paginatedData = filteredData.slice(indexOfFirstRecord, indexOfLastRecord);

  const handleFilterChange = (field, value) => { setFilters(p => ({ ...p, [field]: value })); setCurrentPage(1); };
  const handleReset = () => { setSearchTerm(''); setFilters({ vehicleType: 'all', duty: 'all', status: 'all' }); setCurrentPage(1); };

  const rider = selectedRider ? riders.find(r => r.riderId === selectedRider) : null;
  const riderHeldParcels   = rider ? getHeldParcels(rider) : [];
  const riderClosedParcels = rider ? getClosedParcels(rider) : [];
  const riderArchivedCount = riderClosedParcels.filter(isArchivedDelivery).length;
  const riderVisibleClosedParcels = showArchivedDeliveries ? riderClosedParcels : riderClosedParcels.filter(p => !isArchivedDelivery(p));

  const th = { padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1 };
  const td = { padding: '13px 16px', borderBottom: '1px solid #f0eaf8', color: '#1a1a1a', verticalAlign: 'middle', whiteSpace: 'nowrap' };

  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', minHeight: '100vh', background: '#f0ecf7', fontFamily: "'DM Sans', sans-serif", color: '#390955', overflowY: 'auto' }}>
      <style>{`
        .hrow:hover td { background: #faf5ff !important; }
        .rider-actions { opacity: 0.8; transition: opacity 0.15s ease; }
        .hrow:hover .rider-actions { opacity: 1; }
      `}</style>

      <PageHeader
        title={selectedRider ? 'Rider Profile Info' : 'Rider Profiles Management'}
        subtitle="View and manage rider performance data · Archiving is managed in Settings > Archived Records"
        breadcrumb={['Dashboard', 'People', 'Riders', selectedRider ? 'Rider Profile Info' : 'Rider Directory']}
        actions={!selectedRider ? (
          <RefreshButton
            onClick={handleRefresh}
            isRefreshing={isRefreshing}
          />
        ) : null}
      />

      {!selectedRider ? (
        <SectionCard noPadding className="mb-6">
          <CardSectionHeader
            icon={Truck}
            title="Registered Riders Ledger"
            subtitle={`${filteredData.length} of ${riders.length} records (${riders.filter(r => r.status === RIDER_STATUS.ACTIVE).length} active on map) — rider performance data and duty status`}
          />
          <FilterBar>
            <FilterBar.Group>
              <FilterBar.Search
                placeholder="Search rider by name, ID, or hub..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
              <FilterBar.Select
                aria-label="Filter by vehicle type"
                value={filters.vehicleType}
                onChange={(e) => handleFilterChange('vehicleType', e.target.value)}
              >
                <option value="all" className="font-medium text-slate-700 bg-white">All Vehicles</option>
                <option value="Motorcycle" className="font-medium text-slate-700 bg-white">Motorcycle</option>
                <option value="Van" className="font-medium text-slate-700 bg-white">Van</option>
                <option value="Bicycle" className="font-medium text-slate-700 bg-white">Bicycle</option>
              </FilterBar.Select>
              <FilterBar.Select
                aria-label="Filter by duty state"
                value={filters.duty}
                onChange={(e) => handleFilterChange('duty', e.target.value)}
              >
                <option value="all" className="font-medium text-slate-700 bg-white">All Duty States</option>
                <option value="online" className="font-medium text-slate-700 bg-white">On Duty</option>
                <option value="on-delivery" className="font-medium text-slate-700 bg-white">On Delivery</option>
                <option value="offline" className="font-medium text-slate-700 bg-white">Off Duty</option>
              </FilterBar.Select>
              <FilterBar.Select
                aria-label="Filter by status"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="all" className="font-medium text-slate-700 bg-white">All Statuses</option>
                <option value={RIDER_STATUS.ACTIVE} className="font-medium text-slate-700 bg-white">Active</option>
                <option value={RIDER_STATUS.PENDING_VERIFICATION} className="font-medium text-slate-700 bg-white">Pending Verification</option>
              </FilterBar.Select>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw size={11} aria-hidden="true" />
                  <span>Reset</span>
                </button>
              )}
              <FilterBar.Count count={filteredData.length} label="results" />
            </FilterBar.Group>
            <FilterBar.Actions className="ml-auto">
              <ExportDropdown onExport={handleExport} disabled={filteredData.length === 0} />
            </FilterBar.Actions>
          </FilterBar>

              <div style={{ padding: '8px 24px 24px' }}>
                <div className="custom-table-scroll" style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto', border: '1px solid #e4d8f2', borderRadius: '12px' }}>
                  <table style={{ width: '100%', minWidth: '1360px', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {[
                          { label: 'Rider ID', Icon: Hash },
                          { label: 'Full Name', Icon: User },
                          { label: 'Email Address', Icon: Mail },
                          { label: 'Phone Number', Icon: Phone },
                          { label: 'Vehicle Info', Icon: Truck },
                          { label: 'Hub Address', Icon: Building2 },
                          { label: 'Deliveries Completed', Icon: Package },
                          { label: 'Rating', Icon: Star },
                          { label: 'On Duty', Icon: Zap },
                          { label: 'Status', Icon: Activity },
                        ].map((col) => {
                          const h = col.label;
                          const HIcon = col.Icon;
                          return (
                          <th
                            key={h}
                            style={{
                              ...th,
                              ...(h === 'Rider ID' ? { position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#f8fafc', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' } : {}),
                              ...(h === 'Deliveries Completed' || h === 'Actions' ? { textAlign: 'right' } : {})
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><HIcon size={12} style={{ color: '#94a3b8' }} />{h}</span>
                          </th>
                          );
                        })}
                        <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <TableSkeleton rows={8} columns={11} />
                      ) : filteredData.length === 0 ? (
                        <tr>
                          <td colSpan={11} style={{ padding: '32px 16px' }}>
                            <EmptyState
                              title="No riders found"
                              description="No riders match the current filter criteria."
                            />
                          </td>
                        </tr>
                      ) : (
                        paginatedData.map((r) => {
                          const badge = RIDER_STATUS_BADGE[r.status] || RIDER_STATUS_BADGE.ACTIVE;
                          const duty = getDutyState(r);
                          const dutyBadge = DUTY_BADGE[duty];
                          return (
                          <tr key={r.riderId} className="hrow" onClick={() => setSelectedRider(r.riderId)}
                            style={{ cursor: 'pointer', background: 'white' }}>
                            <td style={{ ...td, fontWeight: 700, color: '#390955', fontFamily: 'monospace', fontSize: 11, position: 'sticky', left: 0, zIndex: 2, background: 'white', borderRight: '1px solid #f0eaf8', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}>{r.riderId}</td>
                            <td style={td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff4ec', border: '2px solid #f37021', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f37021', flexShrink: 0 }}><VehicleIcon type={r.vehicleType} size={16} /></div>
                                <div style={{ fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{r.fullName}</div>
                              </div>
                            </td>
                            <td style={{ ...td, fontSize: 12 }}>{r.email || '—'}</td>
                            <td style={{ ...td, fontSize: 12 }}>{r.phone || '—'}</td>
                            <td style={td}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{r.vehicleType}</div>
                              <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{r.vehiclePlateNumber || '—'}</div>
                            </td>
                            <td style={td}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#390955', background: '#f5f0fc', padding: '3px 9px', borderRadius: 6, display: 'inline-block', whiteSpace: 'nowrap' }}>
                                {r.raw?.assignedHubAddress || r.raw?.address || (r.location?.city ? `${r.location.city} Hub` : 'Pulilan Hub')}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.performance.deliveriesCount}</td>
                            <td style={{ ...td, textAlign: 'center' }}><Stars rating={r.performance.rating}/></td>
                            <td style={td}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                background: dutyBadge.bg, color: dutyBadge.color, whiteSpace: 'nowrap' }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: dutyBadge.dot }}/>
                                {DUTY_LABELS[duty]}
                              </span>
                            </td>
                            <td style={td}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                background: badge.bg, color: badge.color, border: badge.border, whiteSpace: 'nowrap' }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.dot }}/>
                                {formatStatusLabel(r.status)}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                              <div className="rider-actions" style={{ display:'inline-flex', gap:6, whiteSpace: 'nowrap' }}>
                                <button onClick={(e) => { e.stopPropagation(); setSelectedRider(r.riderId); }}
                                  style={{ padding: '5px 10px', border: 'none', borderRadius: 6, background: '#390955', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                                  View <ArrowRight size={12} aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );})
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ padding: '0 24px 16px', borderTop: '1px solid #f0eaf8', background: '#faf8ff' }}>
                <PaginationControls
                  currentPage={safePage}
                  totalRecords={filteredData.length}
                  rowsPerPage={itemsPerPage}
                  rowsPerPageOptions={[8, 25, 50, 100]}
                  onPageChange={setCurrentPage}
                  onRowsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
                />
              </div>
            </SectionCard>
        ) : (
          /* PROFILE VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button onClick={() => setSelectedRider(null)}
              style={{ padding: '8px 16px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'white', color: '#390955', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={13} aria-hidden="true" /> Back to Report Records
            </button>

            {rider && (
              <>
                <div style={{ background: '#390955', borderRadius: 12, padding: '24px 28px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f37021', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, border: '3px solid rgba(255,255,255,0.3)' }}><VehicleIcon type={rider.vehicleType} size={32} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{rider.fullName}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>{rider.riderId} · {rider.vehicleType} · Joined {rider.joined}</div>
                      <div style={{ marginTop: 10 }}><Stars rating={rider.performance.rating}/></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: '#f37021', color: 'white' }}>
                        {formatStatusLabel(rider.status)}
                      </span>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{rider.location.city}</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', background: 'white', border: '1px solid #d5cbe4', borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    { label: 'Deliveries Completed', value: rider.performance.deliveriesCount, color: '#390955', accent: true },
                    { label: 'Rating',               value: rider.performance.rating,         color: '#f37021', accent: false },
                    { label: 'Status',               value: formatStatusLabel(rider.status),  color: '#390955', accent: false },
                  ].map((s, i) => (
                    <div key={s.label} style={{ padding: '13px 18px', borderLeft: i === 0 ? 'none' : '1px solid #e8e1f2', background: s.accent ? '#faf7fd' : 'white' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#a890c0', textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.label}</div>
                      <div style={{ fontSize: s.accent ? 26 : 21, fontWeight: 800, color: s.color, lineHeight: 1.1, marginTop: 4 }}>{s.value}</div>
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
                        ['Full Name',          rider.fullName],
                        ['Rider ID',           rider.riderId],
                        ['Email Address',      rider.email || '—'],
                        ['Phone Number',       rider.phone || '—'],
                        ['Vehicle Info',       `${rider.vehicleType}${rider.vehiclePlateNumber ? ` (${rider.vehiclePlateNumber})` : ''}`],
                        ['Driver License No.', rider.driverLicenseNumber || '—'],
                        ['Plate No.',          rider.vehiclePlateNumber || '—'],
                        ['Hub Address',        rider.raw?.assignedHubAddress || rider.raw?.address || (rider.location.city ? `${rider.location.city} Hub` : 'Pulilan Hub')],
                        ['City',               rider.location.city || '—'],
                        ['Province',           rider.location.province || '—'],
                        ['Joined',             rider.joined],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 }}>
                          <span style={{ color: '#888', fontWeight: 500 }}>{k}</span>
                          <span style={{ color: '#1a1a1a', fontWeight: 700 }}>{v}</span>
                        </div>
                      ))}

                      <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 2 }}>Emergency Contact</div>
                      {[
                        ['Name',  rider.emergencyContactName || '—'],
                        ['Phone', rider.emergencyContactPhone || '—'],
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
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: riderHeldParcels.length ? '#e6f9ed' : '#f5f5f5', color: riderHeldParcels.length ? '#1e7e34' : '#888' }}>
                      {riderHeldParcels.length} held
                    </span>
                  </div>
                  {riderHeldParcels.length === 0 ? (
                    <div style={{ padding: '20px 18px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No shipments currently held.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>{[
                            { label: 'Tracking No.', Icon: Hash },
                            { label: 'Item', Icon: Package },
                            { label: 'Destination', Icon: MapPin },
                            { label: 'Status', Icon: Activity },
                          ].map((col) => {
                            const HIcon = col.Icon;
                            return <th key={col.label} style={{ ...th, position: 'static' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><HIcon size={12} style={{ color: '#94a3b8' }} />{col.label}</span></th>;
                          })}</tr>
                        </thead>
                        <tbody>
                          {riderHeldParcels.map(p => (
                            <tr key={p._id} className="hrow" onClick={() => setViewParcel(p)} style={{ cursor: 'pointer' }}>
                              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#390955' }}>{p.trackingNumber}</td>
                              <td style={td}>{p.item}</td>
                              <td style={td}>{p.destination || '—'}</td>
                              <td style={td}><StatusBadge status={p.status} /></td>
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
                        style={{ padding: '4px 10px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', fontFamily: 'inherit' }}>
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
                          <tr>{[
                            { label: 'Tracking No.', Icon: Hash },
                            { label: 'Item', Icon: Package },
                            { label: 'Destination', Icon: MapPin },
                            { label: 'Status', Icon: Activity },
                            { label: 'Updated', Icon: Calendar },
                          ].map((col) => {
                            const HIcon = col.Icon;
                            return <th key={col.label} style={{ ...th, position: 'static' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><HIcon size={12} style={{ color: '#94a3b8' }} />{col.label}</span></th>;
                          })}</tr>
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
                                  <StatusBadge status={p.status} />
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

      {/* EDIT MODAL */}
      {editingRider && (
        <Modal
          zIndex={9999} blur={false} tint="rgba(26,10,36,0.5)" overlayStyle={{ backdropFilter: 'blur(4px)' }}
          padding={0} cardStyle={{ background: 'transparent', boxShadow: 'none', width: 'auto', maxWidth: 'none', maxHeight: 'none', overflowY: 'visible' }}
        >
          <form onSubmit={handleSaveEdit} style={{ width: 460, background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 36px rgba(57,9,85,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #f0eaf8', background: '#390955' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>Edit Rider Profile</h3>
              <button type="button" onClick={() => setEditingRider(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>

            {saveMsg && <div style={{ background: '#d1fae5', color: '#065f46', padding: '10px 24px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}><CheckCircle2 size={15} aria-hidden="true" /> {saveMsg}</div>}
            {saveErr && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 24px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}><XCircle size={15} aria-hidden="true" /> {saveErr}</div>}

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
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Emergency Contact Name</label>
                <input type="text" value={editingRider.emergencyContactName || ''} onChange={e => setEditingRider({ ...editingRider, emergencyContactName: e.target.value })}
                  style={{ padding: '10px 14px', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#faf9ff', color: '#1a1a1a' }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase' }}>Emergency Contact Phone</label>
                <input type="text" value={editingRider.emergencyContactPhone || ''} onChange={e => setEditingRider({ ...editingRider, emergencyContactPhone: e.target.value })}
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
        </Modal>
      )}

      {/* PARCEL INFO MODAL */}
      {viewParcel && (
        <Modal
          zIndex={9999} blur={false} tint="rgba(26,10,36,0.5)" overlayStyle={{ backdropFilter: 'blur(4px)' }}
          onBackdropClick={() => setViewParcel(null)}
          padding={0} cardStyle={{ width: 460, borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 36px rgba(57,9,85,0.25)', maxHeight: '85vh', maxWidth: 'none', display: 'flex', flexDirection: 'column' }}
        >
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
        </Modal>
      )}
    </div>
  );
}
