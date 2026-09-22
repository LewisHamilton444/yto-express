import React, { useState, useEffect, useRef } from 'react';
import './ViewSeller.css';
import { normalizeSeller, formatStatusLabel, SELLER_STATUS } from './sellerRiderData';
import PaginationControls from './PaginationControls';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import ExportDropdown from './components/ui/ExportDropdown';
import RefreshButton from './components/ui/RefreshButton';
import { apiFetch } from './services/api';
import useSSE from './services/useSSE';
import StatusBadge from './components/ui/StatusBadge';
import { SELLER_STATUS_COLORS } from './components/ui/statusColors';
import Modal from './components/ui/Modal';
import { Hash, User, Mail, Phone, MapPin, Activity, Store } from 'lucide-react';
import { useToast } from './components/ui/useToast';
import PageHeader from './components/ui/PageHeader';
import EmptyState from './components/ui/EmptyState';
import Badge from './components/ui/Badge';
import SectionCard from './components/ui/SectionCard';
import CardSectionHeader from './components/ui/CardSectionHeader';
import FilterBar from './components/ui/FilterBar';

const SELLER_EXPORT_COLUMNS = [
  { key: 'sellerId', label: 'Seller ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'storeName', label: 'Store Name' },
  { key: 'storeAddress', label: 'Store Address' },
  { key: 'status', label: 'Status' },
];

const GenerateSellerReport = () => {
  // Sellers come from the live GET /api/sellers fetch below — the old
  // externalSellers/onUpdateSellers props fed a dashboard-held mock row
  // (removed with the de-demo migration).
  const [sellers, setSellers] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sellersRef = useRef(sellers);
  const { on: onSSE } = useSSE();

  const fetchSellers = async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const response = await apiFetch('/sellers');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      const normalized = Array.isArray(data) ? data.map(normalizeSeller) : [];
      setSellers(normalized);
      sellersRef.current = normalized;
    } catch (err) {
      console.error("Error fetching sellers:", err);
      setSellers([]);
      sellersRef.current = [];
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  useEffect(() => {
    if (!onSSE) return;
    const unsub = onSSE('user-synced', (ev) => {
      if (!ev || ev.role === 'seller') {
        fetchSellers();
      }
    });
    return () => { if (unsub) unsub(); };
  }, [onSSE]);

  const applyUpdate = (next) => {
    sellersRef.current = next;
    setSellers(next);
  };

  const [searchTerm,    setSearchTerm]    = useState('');
  const [statusFilter,  setStatusFilter]  = useState('All');
  const [editingSeller, setEditingSeller] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [detailSeller,  setDetailSeller]  = useState(null);
  const [detailTab,     setDetailTab]     = useState('details');
  const [sellerTimeline, setSellerTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [currentPage,   setCurrentPage]   = useState(1);
  const [recordsPerPage,setRecordsPerPage]= useState(10);
  const toast = useToast();

  // Archived sellers live in Settings > Archived Records now, not here.
  const filteredSellers = sellers.filter(seller => {
    if (seller.status === SELLER_STATUS.ARCHIVED) return false;
    const matchesSearch =
      seller.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller.sellerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (seller.storeName && seller.storeName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'All'
      || (statusFilter === 'INACTIVE'
          ? (seller.status === 'INACTIVE' || seller.status === 'Inactive' || seller.status === 'Deactivated' || seller.status === 'SUSPENDED' || seller.status === 'suspended')
          : seller.status === statusFilter);
    return matchesSearch && matchesStatus;
  });

  const maxPage = Math.max(1, Math.ceil(filteredSellers.length / recordsPerPage));
  const safePage = Math.min(currentPage, maxPage);
  const indexOfLastRecord  = safePage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords     = filteredSellers.slice(indexOfFirstRecord, indexOfLastRecord);

  const handleSearchChange       = (e) => { setSearchTerm(e.target.value);   setCurrentPage(1); };
  const handleStatusFilterChange = (e) => { setStatusFilter(e.target.value); setCurrentPage(1); };

  const getExportData = () => filteredSellers.map(s => ({
    ...s,
    storeAddress: s.address?.street || s.address?.city || s.raw?.address || '—',
  }));

  const handleExport = (format) => {
    const data = getExportData();
    if (format === 'excel') {
      exportToExcel(data, SELLER_EXPORT_COLUMNS, 'sellers-ledger');
    } else if (format === 'word') {
      exportToWord(data, SELLER_EXPORT_COLUMNS, 'sellers-ledger', 'Sellers Ledger Report');
    } else if (format === 'pdf') {
      exportToPDF(data, SELLER_EXPORT_COLUMNS, 'sellers-ledger', 'Sellers Ledger Report');
    } else {
      exportToCSV(data, SELLER_EXPORT_COLUMNS, 'sellers-ledger');
    }
  };

  const formatTimelineDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const fetchSellerTimeline = async (seller) => {
    try {
      setTimelineLoading(true);
      const events = [];

      // Registration event
      events.push({
        status: 'Registered',
        changedAt: seller.raw?.createdAt || seller.createdAt,
        reason: `${seller.fullName} joined as a seller`,
      });

      // Status history from DB
      if (seller.raw?.statusHistory && seller.raw.statusHistory.length > 0) {
        seller.raw.statusHistory.forEach(sh => {
          events.push({
            status: sh.status,
            changedAt: sh.changedAt,
            reason: sh.reason || 'Status changed',
          });
        });
      }

      events.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
      setSellerTimeline(events);
    } catch (err) {
      console.error('Error fetching seller timeline:', err);
      setSellerTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    try {
      const updateData = {
        fullName:   editingSeller.fullName,
        storeName:  editingSeller.storeName,
        warehouseAddress: editingSeller.warehouseAddress,
        operatingHours: editingSeller.operatingHours,
        idType:     editingSeller.idType,
        idNumber:   editingSeller.governmentIdNumber,
        email:      editingSeller.email,
        phone:      editingSeller.phone,
        address:    editingSeller.address.street,
        city:       editingSeller.address.city,
        state:      editingSeller.address.state,
        postalCode: editingSeller.address.postalCode,
        country:    editingSeller.address.country,
        bankName:   editingSeller.bankName,
        paymentCycle:   editingSeller.paymentCycle,
        commissionRate: editingSeller.commissionRate,
      };

      const response = await apiFetch(`/sellers/${editingSeller._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to save');

      const next = sellersRef.current.map(s =>
        s._id === editingSeller._id ? { ...s, ...editingSeller } : s
      );
      applyUpdate(next);
      toast('Changes saved successfully!');
      setTimeout(() => {
        setShowEditModal(false);
        setEditingSeller(null);
      }, 350);
    } catch (err) {
      console.error('Error saving changes:', err);
      toast('Failed to save. Check your backend connection.', 'error');
    }
  };

  const s = {
    main:        { flex: 1, padding: '24px 30px 48px', minHeight: '100vh', background: '#f0ecf7', fontFamily: "'DM Sans', sans-serif", color: '#390955' },
    formInput:   { padding: '10px 14px', background: 'white', border: '1.5px solid #e4d8f2', borderRadius: '10px', color: '#390955', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    table:       { width: '100%', minWidth: '1080px', borderCollapse: 'collapse', fontSize: '13px' },
    th:          { padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
    td:          { padding: '14px 16px', color: '#390955', borderBottom: '1px solid #f3edfb', whiteSpace: 'nowrap' },
    btnPrimary:  { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit' },
    btnOutline:  { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
    detailRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 },
    detailLabel: { color: '#a890c0', fontWeight: 600 },
    detailValue: { color: '#390955', fontWeight: 700, textAlign: 'right' },
    detailSection:{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '18px 0 6px' },
  };

  return (
    <div style={s.main}>
      <PageHeader
        title="Seller Profiles Management"
        subtitle="Search and update seller records · Archiving is managed in Settings > Archived Records"
        breadcrumb={['Dashboard', 'People', 'Sellers', 'Seller Directory']}
        actions={(
          <RefreshButton
            onClick={() => fetchSellers(true)}
            isRefreshing={isRefreshing}
          />
        )}
      />

      <SectionCard noPadding className="mb-6">
        <CardSectionHeader
          icon={Store}
          title="Registered Sellers Ledger"
          subtitle={`${filteredSellers.length} of ${sellers.length} records — registered merchant accounts and shipping profiles`}
        />
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search seller by name, store, or ID..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All Statuses</option>
              <option value={SELLER_STATUS.ACTIVE} className="font-medium text-slate-700 bg-white">Active</option>
              <option value="INACTIVE" className="font-medium text-slate-700 bg-white">Inactive</option>
            </FilterBar.Select>
            <FilterBar.Count count={filteredSellers.length} label="results" />
          </FilterBar.Group>
          <FilterBar.Actions>
            <ExportDropdown onExport={handleExport} disabled={filteredSellers.length === 0} />
          </FilterBar.Actions>
        </FilterBar>

        <div style={{ padding: '8px 24px 24px' }}>
          <style>{`
            .seller-row:hover td { background: #faf7fd !important; }
            .seller-actions { opacity: 0.8; transition: opacity 0.15s ease; }
            .seller-row:hover .seller-actions { opacity: 1; }
          `}</style>
          <div className="custom-table-scroll" style={{ overflowX: 'auto', border: '1px solid #e4d8f2', borderRadius: '12px' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, position: 'sticky', left: 0, zIndex: 10, background: '#f8fafc', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Hash size={12} style={{ color: '#94a3b8' }} />Seller ID</span></th>
                  <th style={s.th}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={12} style={{ color: '#94a3b8' }} />Full Name</span></th>
                  <th style={s.th}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={12} style={{ color: '#94a3b8' }} />Email Address</span></th>
                  <th style={s.th}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Phone size={12} style={{ color: '#94a3b8' }} />Phone Number</span></th>
                  <th style={s.th}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={12} style={{ color: '#94a3b8' }} />Store Address</span></th>
                  <th style={s.th}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Activity size={12} style={{ color: '#94a3b8' }} />Status</span></th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '32px 16px' }}>
                      <EmptyState
                        title="No seller records match your search"
                        description="Try adjusting your search or lifecycle status filter."
                      />
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((seller, idx) => {
                    return (
                      <tr key={seller._id || idx} className="seller-row" style={{ background: 'white' }}>
                        <td style={{ ...s.td, fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: '12px', position: 'sticky', left: 0, zIndex: 5, background: 'white', borderRight: '1px solid #f1ecf8', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}>{seller.sellerId}</td>
                        <td style={{ ...s.td, fontWeight: 700 }}>
                          <div>{seller.fullName || '—'}</div>
                        </td>
                        <td style={{ ...s.td, fontSize: '12px' }}>
                          <div>{seller.email || '—'}</div>
                        </td>
                        <td style={{ ...s.td, fontSize: '12px' }}>
                          <div>{seller.phone || '—'}</div>
                        </td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 600, color: '#390955', whiteSpace: 'nowrap' }}>{seller.storeName || seller.raw?.storeName || '—'}</div>
                          <div style={{ fontSize: '11.5px', color: '#a890c0', marginTop: '2px', whiteSpace: 'nowrap' }}>
                            {seller.address?.street || seller.warehouseAddress || seller.raw?.warehouseAddress || seller.address?.city || seller.raw?.address || '—'}
                          </div>
                        </td>
                        <td style={s.td}>
                          <StatusBadge status={seller.status} label={formatStatusLabel(seller.status)} colorMap={SELLER_STATUS_COLORS} fallback="ACTIVE" />
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div className="seller-actions" style={{ display: 'inline-flex', gap: '8px', whiteSpace: 'nowrap' }}>
                            <button style={s.btnOutline} onClick={() => { setDetailTab('details'); setSellerTimeline([]); setDetailSeller(seller); fetchSellerTimeline(seller); }}>
                              View Details
                            </button>
                            <button style={s.btnOutline} onClick={() => { setEditingSeller({ ...seller, address: { ...seller.address } }); setShowEditModal(true); }}>
                              Edit Info
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={safePage}
            totalRecords={filteredSellers.length}
            rowsPerPage={recordsPerPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={(n) => { setRecordsPerPage(n); setCurrentPage(1); }}
          />
        </div>
      </SectionCard>

      {/* DETAIL VIEW MODAL — full bank + address info */}
      {detailSeller && (
        <Modal tint="rgba(26,6,40,0.5)" blur={false} maxWidth={480} padding={0} onBackdropClick={() => setDetailSeller(null)} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
            <div style={{ background: '#390955', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 700 }}>{detailSeller.fullName || 'Seller'}</h3>
                {(detailSeller.storeName || detailSeller.raw?.storeName) && (
                  <div style={{ color: '#f37021', fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                    {detailSeller.storeName || detailSeller.raw?.storeName}
                  </div>
                )}
                <p style={{ color: 'rgba(255,255,255,0.6)', margin: '2px 0 0', fontSize: '12px' }}>{detailSeller.sellerId}</p>
              </div>
              <button onClick={() => setDetailSeller(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '20px 24px 24px' }}>
              <div style={s.detailSection}>Identification</div>
              <div style={s.detailRow}><span style={s.detailLabel}>ID Type</span><span style={s.detailValue}>{detailSeller.idType}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Government ID No.</span><span style={s.detailValue}>{detailSeller.governmentIdNumber || '—'}</span></div>

              <div style={s.detailSection}>Contact Point</div>
              <div style={s.detailRow}><span style={s.detailLabel}>Email</span><span style={s.detailValue}>{detailSeller.email || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Phone</span><span style={s.detailValue}>{detailSeller.phone || '—'}</span></div>

              <div style={s.detailSection}>Address</div>
              <div style={s.detailRow}><span style={s.detailLabel}>Street</span><span style={s.detailValue}>{detailSeller.address.street || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>City</span><span style={s.detailValue}>{detailSeller.address.city || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>State / Province</span><span style={s.detailValue}>{detailSeller.address.state || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Postal Code</span><span style={s.detailValue}>{detailSeller.address.postalCode || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Country</span><span style={s.detailValue}>{detailSeller.address.country || '—'}</span></div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '2px solid #f0eaf8', margin: '16px 0 0' }}>
                {[{ key: 'details', label: 'Details' }, { key: 'timeline', label: 'Timeline' }].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} style={{
                    flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
                    background: detailTab === tab.key ? '#faf7fd' : 'transparent',
                    color: detailTab === tab.key ? '#390955' : '#a890c0',
                    borderBottom: detailTab === tab.key ? '2px solid #390955' : '2px solid transparent',
                    marginBottom: -2,
                  }}>{tab.label}</button>
                ))}
              </div>

              {/* Details Tab */}
              {detailTab === 'details' && (
                <>
                  <div style={s.detailSection}>Store &amp; Operations</div>
                  <div style={s.detailRow}><span style={s.detailLabel}>Store Name</span><span style={s.detailValue}>{detailSeller.storeName || detailSeller.raw?.storeName || 'Personal Merchant'}</span></div>
                  <div style={s.detailRow}><span style={s.detailLabel}>Warehouse Address</span><span style={s.detailValue}>{detailSeller.warehouseAddress || detailSeller.raw?.warehouseAddress || '—'}</span></div>
                  <div style={s.detailRow}><span style={s.detailLabel}>Operating Hours</span><span style={s.detailValue}>{detailSeller.operatingHours || detailSeller.raw?.operatingHours || '—'}</span></div>
                  <div style={s.detailRow}><span style={s.detailLabel}>Registration Date</span><span style={s.detailValue}>{detailSeller.createdAt || detailSeller.raw?.createdAt ? formatTimelineDate(detailSeller.createdAt || detailSeller.raw?.createdAt) : '—'}</span></div>
                  {detailSeller.bankName ? (
                    <>
                      <div style={s.detailSection}>Bank &amp; Payout</div>
                      <div style={s.detailRow}><span style={s.detailLabel}>Bank Name</span><span style={s.detailValue}>{detailSeller.bankName}</span></div>
                      <div style={s.detailRow}><span style={s.detailLabel}>Account Number</span><span style={s.detailValue}>{detailSeller.accountNumber || '—'}</span></div>
                      <div style={s.detailRow}><span style={s.detailLabel}>Payment Cycle</span><span style={s.detailValue}>{detailSeller.paymentCycle || 'Weekly'}</span></div>
                      <div style={s.detailRow}><span style={s.detailLabel}>Commission Rate</span><span style={s.detailValue}>{detailSeller.commissionRate ?? 0}%</span></div>
                    </>
                  ) : null}
                </>
              )}

              {/* Timeline Tab */}
              {detailTab === 'timeline' && (
                <div style={{ marginTop: 12 }}>
                  {timelineLoading ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#a890c0', fontSize: 12 }}>Loading timeline...</div>
                  ) : sellerTimeline.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4c8e8" strokeWidth="1.5" style={{ marginBottom: 6 }}>
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      <p style={{ color: '#a890c0', fontSize: 12, margin: 0 }}>No status history yet</p>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', paddingLeft: 24 }}>
                      <div style={{ position: 'absolute', left: 9, top: 6, bottom: 6, width: 2, background: '#390955', borderRadius: 1, opacity: 0.3 }} />
                      {sellerTimeline.map((evt, idx) => (
                        <div key={idx} style={{ position: 'relative', marginBottom: idx < sellerTimeline.length - 1 ? 16 : 0 }}>
                          <div style={{ position: 'absolute', left: -24, top: 2, width: 18, height: 18, borderRadius: '50%', background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, boxShadow: '0 0 0 3px white, 0 0 0 4px rgba(57,9,85,0.2)' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                          </div>
                          <div style={{ padding: '8px 12px', background: '#faf7fd', borderRadius: 8, border: '1px solid #ede6f7' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#1f1329' }}>Status: {evt.status}</span>
                              <span style={{ fontSize: 9, color: '#a890c0' }}>{formatTimelineDate(evt.changedAt)}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>{evt.reason || 'No reason provided'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button style={s.btnOutline} onClick={() => setDetailSeller(null)}>Close</button>
              </div>
            </div>
        </Modal>
      )}

      {showEditModal && editingSeller && (
        <Modal tint="rgba(26,6,40,0.5)" blur={false} maxWidth={500} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#390955', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 700 }}>Update Profile Details</h3>
              <button onClick={() => { setShowEditModal(false); setEditingSeller(null); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSaveChanges} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>


              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Full Name</label>
                <input type="text" required style={s.formInput} value={editingSeller.fullName || ''} onChange={e => setEditingSeller({ ...editingSeller, fullName: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Store / Business Name</label>
                <input type="text" style={s.formInput} value={editingSeller.storeName || ''} onChange={e => setEditingSeller({ ...editingSeller, storeName: e.target.value })} placeholder="e.g. Acme Supplies" />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Warehouse Address</label>
                <input type="text" style={s.formInput} value={editingSeller.warehouseAddress || ''} onChange={e => setEditingSeller({ ...editingSeller, warehouseAddress: e.target.value })} placeholder="e.g. Warehouse 4, Pulilan" />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Operating Hours</label>
                <input type="text" style={s.formInput} value={editingSeller.operatingHours || ''} onChange={e => setEditingSeller({ ...editingSeller, operatingHours: e.target.value })} placeholder="e.g. 08:00 AM - 05:00 PM" />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>ID Type</label>
                <select style={s.formInput} value={editingSeller.idType || 'National ID'} onChange={e => setEditingSeller({ ...editingSeller, idType: e.target.value })}>
                  <option>National ID</option>
                  <option>Passport</option>
                  <option>Driver's License</option>
                  <option>PhilSys ID</option>
                  <option>Postal ID</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Government ID Number (Optional)</label>
                <input type="text" style={s.formInput} value={editingSeller.governmentIdNumber || ''} onChange={e => setEditingSeller({ ...editingSeller, governmentIdNumber: e.target.value })} placeholder="Verified via App OTP if blank" />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Email</label>
                <input type="email" required style={s.formInput} value={editingSeller.email || ''} onChange={e => setEditingSeller({ ...editingSeller, email: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Phone</label>
                <input type="text" required style={s.formInput} value={editingSeller.phone || ''} onChange={e => setEditingSeller({ ...editingSeller, phone: e.target.value })} />
              </div>

              <div style={s.detailSection}>Address</div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Street</label>
                <input type="text" style={s.formInput} value={editingSeller.address.street || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, street: e.target.value } })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>City</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.city || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, city: e.target.value } })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>State / Province</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.state || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, state: e.target.value } })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Postal Code</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.postalCode || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, postalCode: e.target.value } })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Country</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.country || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, country: e.target.value } })} />
                </div>
              </div>

              <div style={s.detailSection}>Bank & Payout</div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Bank Name</label>
                <input type="text" style={s.formInput} value={editingSeller.bankName || ''} onChange={e => setEditingSeller({ ...editingSeller, bankName: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Payment Cycle</label>
                  <select style={s.formInput} value={editingSeller.paymentCycle || 'Weekly'} onChange={e => setEditingSeller({ ...editingSeller, paymentCycle: e.target.value })}>
                    <option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Commission Rate (%)</label>
                  <input type="number" style={s.formInput} value={editingSeller.commissionRate ?? 0} onChange={e => setEditingSeller({ ...editingSeller, commissionRate: Number(e.target.value) })} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" style={s.btnOutline} onClick={() => { setShowEditModal(false); setEditingSeller(null); }}>Cancel</button>
                <button type="submit" style={s.btnPrimary}>Save Changes</button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
};

export default GenerateSellerReport;
