import React, { useState, useEffect, useRef } from 'react';
import './ViewSeller.css';
import './LedgerPage.css';
import { LEDGER_MODAL_CARD, LEDGER_MODAL_OVERLAY, LEDGER_MODAL_TINT, initialsOf } from './ledger';
import { normalizeSeller, formatStatusLabel, SELLER_STATUS } from './sellerRiderData';
import PaginationControls from './PaginationControls';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import ExportDropdown from './components/ui/ExportDropdown';
import RefreshButton from './components/ui/RefreshButton';
import { apiFetch } from './services/api';
import useSSE from './services/useSSE';
import LedgerStatus from './components/ui/LedgerStatus';
import Modal from './components/ui/Modal';
import { Hash, User, Mail, Phone, MapPin, Activity, Store, Eye, Pencil, X, Info, History } from 'lucide-react';
import { useToast } from './components/ui/useToast';
import PageHeader from './components/ui/PageHeader';
import EmptyState from './components/ui/EmptyState';
import Badge from './components/ui/Badge';
import SectionCard from './components/ui/SectionCard';
import CardSectionHeader from './components/ui/CardSectionHeader';
import FilterBar from './components/ui/FilterBar';
import { takeSearchHandoff, onSearchHandoff } from './utils/searchHandoff';

const SELLER_EXPORT_COLUMNS = [
  { key: 'sellerId', label: 'Seller ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'storeName', label: 'Store Name' },
  { key: 'storeAddress', label: 'Store Address' },
  { key: 'status', label: 'Status' },
];

// Seller status → ledger pill tone.
function sellerTone(status) {
  const v = String(status || '').toUpperCase();
  if (v === 'ACTIVE') return 'on';
  if (v === 'PENDING_VERIFICATION' || v === 'PENDING') return 'pending';
  if (['INACTIVE', 'DEACTIVATED', 'SUSPENDED', 'ARCHIVED'].includes(v)) return 'off';
  return 'neutral';
}

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

  const [searchTerm,    setSearchTerm]    = useState(() => takeSearchHandoff('seller-report'));
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

  // A seller picked in the header search while this page is already open.
  useEffect(() => onSearchHandoff('seller-report', (term) => {
    setSearchTerm(term); setStatusFilter('All'); setCurrentPage(1);
  }), []);

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

  const openDetails = (seller) => {
    setDetailTab('details');
    setSellerTimeline([]);
    setDetailSeller(seller);
    fetchSellerTimeline(seller);
  };
  const openEdit = (seller) => {
    setEditingSeller({ ...seller, address: { ...seller.address } });
    setShowEditModal(true);
  };

  const visibleSellers = sellers.filter(x => x.status !== SELLER_STATUS.ARCHIVED);
  const activeCount = visibleSellers.filter(x => sellerTone(x.status) === 'on').length;
  const pendingCount = visibleSellers.filter(x => sellerTone(x.status) === 'pending').length;

  return (
    <div className="lp-page">
      <PageHeader
        className="lp-header"
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

      {/* Ledger card — fills the rest of the screen; only the table body
          scrolls (header row pinned) and pagination is docked in the footer. */}
      <SectionCard
        noPadding
        className="lp-card"
        bodyClassName="lp-card-body"
        footer={filteredSellers.length > 0 ? (
          <div className="lp-footer">
            <PaginationControls
              currentPage={safePage}
              totalRecords={filteredSellers.length}
              rowsPerPage={recordsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(n) => { setRecordsPerPage(n); setCurrentPage(1); }}
            />
          </div>
        ) : null}
      >
        <div className="lp-section-head">
          <CardSectionHeader
            icon={Store}
            title="Registered Sellers Ledger"
            subtitle="Registered merchant accounts and shipping profiles"
          />
        </div>
        <FilterBar className="lp-toolbar">
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search seller by name, store, or ID..."
              aria-label="Search sellers"
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All</option>
              <option value={SELLER_STATUS.ACTIVE} className="font-medium text-slate-700 bg-white">Active</option>
              <option value="INACTIVE" className="font-medium text-slate-700 bg-white">Inactive</option>
            </FilterBar.Select>
            <span className="lp-count">
              <strong>{filteredSellers.length}</strong> of {visibleSellers.length} sellers
              <span className="lp-count-active">{activeCount} active</span>
              {pendingCount > 0 && <span className="lp-count-active lp-count-pending">{pendingCount} pending</span>}
            </span>
          </FilterBar.Group>
          <FilterBar.Actions>
            <ExportDropdown onExport={handleExport} disabled={filteredSellers.length === 0} className="lp-export" />
          </FilterBar.Actions>
        </FilterBar>

        <div className="lp-table-scroll custom-table-scroll">
          <table className="lp-table w-full text-left">
            <thead>
              <tr>
                {[
                  { label: 'Seller ID', icon: Hash },
                  { label: 'Full Name', icon: User },
                  { label: 'Email Address', icon: Mail },
                  { label: 'Phone Number', icon: Phone },
                  { label: 'Store', icon: MapPin },
                  { label: 'Status', icon: Activity },
                ].map(h => (
                  <th key={h.label} className="whitespace-nowrap font-bold uppercase text-left">
                    <span className="flex items-center gap-1.5"><h.icon size={12} className="lp-th-icon" aria-hidden="true" />{h.label}</span>
                  </th>
                ))}
                <th className="whitespace-nowrap font-bold uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRecords.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '32px 16px' }}>
                    <EmptyState
                      title={visibleSellers.length === 0 ? 'No seller records yet' : 'No seller records match your search'}
                      description={visibleSellers.length === 0 ? 'Sellers appear here once they register through the mobile app.' : 'Try adjusting your search or status filter.'}
                    />
                  </td>
                </tr>
              ) : (
                currentRecords.map((seller, idx) => {
                  const storeName = seller.storeName || seller.raw?.storeName || '';
                  const storeAddress = seller.address?.street || seller.warehouseAddress || seller.raw?.warehouseAddress || seller.address?.city || seller.raw?.address || '';
                  return (
                    <tr key={seller._id || idx} className="group cursor-pointer" onClick={() => openDetails(seller)}>
                      <td className="lp-id whitespace-nowrap">{seller.sellerId}</td>
                      <td className="whitespace-nowrap">
                        <span className="lp-name">
                          <span className="lp-avatar" aria-hidden="true">{initialsOf(seller.fullName)}</span>
                          <span className="lp-name-text">{seller.fullName || '—'}</span>
                        </span>
                      </td>
                      <td className="lp-muted lp-email whitespace-nowrap" title={seller.email || undefined}>{seller.email || '—'}</td>
                      <td className="lp-muted whitespace-nowrap tabular-nums">{seller.phone || '—'}</td>
                      <td className="whitespace-nowrap">
                        <span className="lp-stack lp-clip" title={[storeName, storeAddress].filter(Boolean).join(' — ') || undefined}>
                          <span className="lp-stack-main">{storeName || 'Personal merchant'}</span>
                          {storeAddress && <span className="lp-stack-sub">{storeAddress}</span>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <LedgerStatus tone={sellerTone(seller.status)}>{formatStatusLabel(seller.status)}</LedgerStatus>
                      </td>
                      <td className="whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                        <span className="lp-row-actions">
                          <button type="button" className="lp-view-btn" onClick={() => openDetails(seller)}>
                            <Eye size={13} aria-hidden="true" /> View
                          </button>
                          <button type="button" className="lp-view-btn is-quiet" onClick={() => openEdit(seller)} aria-label={`Edit ${seller.fullName || 'seller'}`}>
                            <Pencil size={13} aria-hidden="true" /> <span className="lp-btn-label">Edit</span>
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* DETAIL VIEW MODAL — identity header, tabs on top, grouped details
          that scroll inside the card, fixed footer. */}
      {detailSeller && (
        <Modal tint={LEDGER_MODAL_TINT} blur={false} overlayStyle={LEDGER_MODAL_OVERLAY} maxWidth={560} padding={0} label="Seller details" onBackdropClick={() => setDetailSeller(null)} cardStyle={LEDGER_MODAL_CARD}>
          <div className="lp-modal-head">
            <span className="lp-modal-avatar" aria-hidden="true">{initialsOf(detailSeller.fullName)}</span>
            <div className="lp-modal-identity">
              <h3>{detailSeller.fullName || 'Seller'}</h3>
              {(detailSeller.storeName || detailSeller.raw?.storeName) && (
                <div className="lp-modal-store">{detailSeller.storeName || detailSeller.raw?.storeName}</div>
              )}
              <div className="lp-modal-meta">
                <span className="lp-modal-id">{detailSeller.sellerId || 'No ID yet'}</span>
                <LedgerStatus tone={sellerTone(detailSeller.status)}>{formatStatusLabel(detailSeller.status)}</LedgerStatus>
              </div>
            </div>
            <button type="button" className="lp-modal-close" onClick={() => setDetailSeller(null)} aria-label="Close seller details">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="lp-modal-tabs" role="tablist" aria-label="Seller details sections">
            {[{ key: 'details', label: 'Details', icon: Info }, { key: 'timeline', label: 'Timeline', icon: History }].map(tab => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.key}
                className={`lp-modal-tab${detailTab === tab.key ? ' is-active' : ''}`}
                onClick={() => setDetailTab(tab.key)}
              >
                <tab.icon size={14} aria-hidden="true" /> {tab.label}
              </button>
            ))}
          </div>

          <div className="lp-modal-body" role="tabpanel">
            {detailTab === 'details' && (
              <div className="lp-detail-groups">
                {[
                  {
                    title: 'Identification',
                    rows: [
                      { label: 'ID Type', value: detailSeller.idType },
                      { label: 'Government ID No.', value: detailSeller.governmentIdNumber },
                    ],
                  },
                  {
                    title: 'Contact Point',
                    rows: [
                      { label: 'Email', value: detailSeller.email, wrap: true },
                      { label: 'Phone', value: detailSeller.phone },
                    ],
                  },
                  {
                    title: 'Address',
                    rows: [
                      { label: 'Street', value: detailSeller.address?.street, wrap: true },
                      { label: 'City', value: detailSeller.address?.city },
                      { label: 'State / Province', value: detailSeller.address?.state },
                      { label: 'Postal Code', value: detailSeller.address?.postalCode },
                      { label: 'Country', value: detailSeller.address?.country },
                    ],
                  },
                  {
                    title: 'Store & Operations',
                    rows: [
                      { label: 'Store Name', value: detailSeller.storeName || detailSeller.raw?.storeName || 'Personal Merchant' },
                      { label: 'Warehouse Address', value: detailSeller.warehouseAddress || detailSeller.raw?.warehouseAddress, wrap: true },
                      { label: 'Operating Hours', value: detailSeller.operatingHours || detailSeller.raw?.operatingHours },
                      { label: 'Registration Date', value: (detailSeller.createdAt || detailSeller.raw?.createdAt) ? formatTimelineDate(detailSeller.createdAt || detailSeller.raw?.createdAt) : '' },
                    ],
                  },
                  ...(detailSeller.bankName ? [{
                    title: 'Bank & Payout',
                    rows: [
                      { label: 'Bank Name', value: detailSeller.bankName },
                      { label: 'Account Number', value: detailSeller.accountNumber },
                      { label: 'Payment Cycle', value: detailSeller.paymentCycle || 'Weekly' },
                      { label: 'Commission Rate', value: `${detailSeller.commissionRate ?? 0}%` },
                    ],
                  }] : []),
                ].map(group => (
                  <section key={group.title} className="lp-detail-group" aria-label={group.title}>
                    <h4>{group.title}</h4>
                    <dl>
                      {group.rows.map(row => {
                        const empty = !(row.value && String(row.value).trim());
                        return (
                          <div key={row.label} className="lp-detail-row">
                            <dt>{row.label}</dt>
                            <dd className={`${row.wrap ? 'is-wrap' : ''}${empty ? ' is-empty' : ''}`}>{empty ? 'Not provided' : row.value}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
              </div>
            )}

            {detailTab === 'timeline' && (
              timelineLoading ? (
                <div className="lp-empty-note">Loading timeline…</div>
              ) : sellerTimeline.length === 0 ? (
                <div className="lp-empty-note">No status history yet</div>
              ) : (
                <ol className="lp-timeline">
                  {sellerTimeline.map((evt, idx) => (
                    <li key={idx} className="lp-timeline-item">
                      <i className="lp-timeline-dot" aria-hidden="true" />
                      <div className="lp-timeline-card">
                        <header>
                          <strong>{evt.status === 'Registered' ? 'Registered' : `Status: ${formatStatusLabel(evt.status)}`}</strong>
                          <time dateTime={evt.changedAt || undefined}>{formatTimelineDate(evt.changedAt)}</time>
                        </header>
                        <p>{evt.reason || 'No reason provided'}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )
            )}
          </div>

          <div className="lp-modal-foot">
            <button type="button" className="lp-btn is-secondary" onClick={() => setDetailSeller(null)}>Close</button>
            <button
              type="button"
              className="lp-btn is-primary"
              onClick={() => { const target = detailSeller; setDetailSeller(null); openEdit(target); }}
            >
              <Pencil size={14} aria-hidden="true" /> Edit Info
            </button>
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
