import React, { useState } from 'react';
import EmptyState from '../components/ui/EmptyState';
import SectionCard from '../components/ui/SectionCard';
import CardSectionHeader from '../components/ui/CardSectionHeader';
import Badge from '../components/ui/Badge';
import FilterBar from '../components/ui/FilterBar';
import PaginationControls from '../PaginationControls';
import { User, Mail, Phone, Store, Truck, Bike, Calendar, Activity, RotateCcw } from 'lucide-react';

const s = {
  panelBody:    { padding: '16px 24px 24px' },
  scroll:       { overflowX: 'auto', border: '1px solid #e4d8f2', borderRadius: '12px' },
  table:        { width: '100%', minWidth: '960px', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  td:           { padding: '14px 16px', color: '#390955', borderBottom: '1px solid #f3edfb', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  btnPrimary:   { padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  sub:          { fontSize: '11.5px', color: '#a890c0', marginTop: '2px' },
};

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso || '—';
  }
};

const PendingVerificationsTable = ({ type, items = [], onReview }) => {
  const label = type === 'rider' ? 'Rider' : 'Seller';

  const [searchTerm, setSearchTerm] = useState('');
  const [timeframeFilter, setTimeframeFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || timeframeFilter !== 'All' || categoryFilter !== 'All' || sortBy !== 'newest'
  );

  const resetFilters = () => {
    setSearchTerm('');
    setTimeframeFilter('All');
    setCategoryFilter('All');
    setSortBy('newest');
    setCurrentPage(1);
  };

  const matchesSearch = (item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (item.fullName && item.fullName.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.contactNumber && String(item.contactNumber).toLowerCase().includes(q)) ||
      (item.id && String(item.id).toLowerCase().includes(q)) ||
      (item.storeName && item.storeName.toLowerCase().includes(q)) ||
      (item.plateNumber && item.plateNumber.toLowerCase().includes(q)) ||
      (item.address && item.address.toLowerCase().includes(q))
    );
  };

  const matchesTimeframe = (item) => {
    if (timeframeFilter === 'All') return true;
    if (!item.submittedAt) return false;
    const itemTime = new Date(item.submittedAt).getTime();
    if (isNaN(itemTime)) return true;
    const diffHours = (Date.now() - itemTime) / (1000 * 60 * 60);
    if (timeframeFilter === 'today') return diffHours <= 24;
    if (timeframeFilter === 'week') return diffHours <= 24 * 7;
    if (timeframeFilter === 'month') return diffHours <= 24 * 30;
    return true;
  };

  const matchesCategory = (item) => {
    if (categoryFilter === 'All') return true;
    if (type === 'seller') {
      const hasStore = item.storeName && item.storeName !== '—' && item.storeName !== '-';
      if (categoryFilter === 'with_store') return Boolean(hasStore);
      if (categoryFilter === 'pending_store') return !hasStore;
    } else {
      const hasPlate = item.plateNumber && item.plateNumber !== '—' && item.plateNumber !== '-';
      const hasVehicle = hasPlate || (item.vehicleType && item.vehicleType !== '—');
      if (categoryFilter === 'with_vehicle') return Boolean(hasVehicle);
      if (categoryFilter === 'pending_vehicle') return !hasVehicle;
    }
    return true;
  };

  const filteredItems = items.filter(
    (item) => matchesSearch(item) && matchesTimeframe(item) && matchesCategory(item)
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'oldest') {
      return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
    }
    if (sortBy === 'name') {
      return (a.fullName || '').localeCompare(b.fullName || '');
    }
    // Default newest
    return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
  });

  const maxPage = Math.max(1, Math.ceil(sortedItems.length / recordsPerPage));
  const safePage = Math.min(currentPage, maxPage);
  const indexOfLast = safePage * recordsPerPage;
  const indexOfFirst = indexOfLast - recordsPerPage;
  const currentRecords = sortedItems.slice(indexOfFirst, indexOfLast);

  return (
    <SectionCard noPadding className="w-full">
      <style>{`
        .pv-row:hover td { background: #faf7fd !important; }
        .pv-action { opacity: 0.85; transition: opacity 0.15s ease; }
        .pv-row:hover .pv-action { opacity: 1; }
      `}</style>

      {/* Card Section Header matching Customers and ViewSeller */}
      <CardSectionHeader
        icon={type === 'seller' ? Store : Bike}
        title={`Pending ${label} Registrations`}
        subtitle={`${sortedItems.length} awaiting review`}
      />

      {/* Control / Filter Bar */}
      <FilterBar>
        <FilterBar.Group>
          <FilterBar.Search
            placeholder={
              type === 'seller'
                ? 'Search applicant by name, store, email, or phone...'
                : 'Search applicant by name, plate, email, or phone...'
            }
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />

          {/* Timeframe Filter */}
          <FilterBar.Select
            aria-label="Filter by submission date"
            value={timeframeFilter}
            onChange={(e) => {
              setTimeframeFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="All" className="font-medium text-slate-700 bg-white">All</option>
            <option value="today" className="font-medium text-slate-700 bg-white">Today</option>
            <option value="week" className="font-medium text-slate-700 bg-white">Past 7 Days</option>
            <option value="month" className="font-medium text-slate-700 bg-white">Past 30 Days</option>
          </FilterBar.Select>

          {/* Category / Status Filter */}
          <FilterBar.Select
            aria-label={type === 'seller' ? 'Filter by store details' : 'Filter by vehicle details'}
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="All" className="font-medium text-slate-700 bg-white">All</option>
            {type === 'seller' ? (
              <>
                <option value="with_store" className="font-medium text-slate-700 bg-white">With Store Name</option>
                <option value="pending_store" className="font-medium text-slate-700 bg-white">Pending Store Name</option>
              </>
            ) : (
              <>
                <option value="with_vehicle" className="font-medium text-slate-700 bg-white">With Vehicle Info</option>
                <option value="pending_vehicle" className="font-medium text-slate-700 bg-white">Pending Vehicle Info</option>
              </>
            )}
          </FilterBar.Select>

          {/* Sort Order */}
          <FilterBar.Select
            aria-label="Sort registrations"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="newest" className="font-medium text-slate-700 bg-white">Newest First</option>
            <option value="oldest" className="font-medium text-slate-700 bg-white">Oldest First</option>
            <option value="name" className="font-medium text-slate-700 bg-white">Applicant Name (A-Z)</option>
          </FilterBar.Select>

          <FilterBar.Count count={sortedItems.length} label="awaiting review" />
        </FilterBar.Group>

        {hasActiveFilters && (
          <FilterBar.Actions>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw size={11} aria-hidden="true" />
              <span>Reset</span>
            </button>
          </FilterBar.Actions>
        )}
      </FilterBar>

      <div style={s.panelBody}>
        <div className="custom-table-scroll" style={s.scroll}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, position: 'sticky', left: 0, zIndex: 10, background: '#f8fafc', borderRight: '1px solid #e2e8f0', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <User size={12} style={{ color: '#94a3b8' }} />Applicant
                  </span>
                </th>
                <th style={s.th}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={12} style={{ color: '#94a3b8' }} />Email Address
                  </span>
                </th>
                <th style={s.th}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={12} style={{ color: '#94a3b8' }} />Phone Number
                  </span>
                </th>
                {type === 'seller' ? (
                  <th style={s.th}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Store size={12} style={{ color: '#94a3b8' }} />Store Address
                    </span>
                  </th>
                ) : (
                  <th style={s.th}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Truck size={12} style={{ color: '#94a3b8' }} />Vehicle Info
                    </span>
                  </th>
                )}
                <th style={s.th}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={12} style={{ color: '#94a3b8' }} />Submitted
                  </span>
                </th>
                <th style={s.th}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={12} style={{ color: '#94a3b8' }} />Status
                  </span>
                </th>
                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '32px 16px' }}>
                    <EmptyState
                      title={items.length === 0 ? `No pending ${label.toLowerCase()} registrations` : 'No matching registrations found'}
                      description={
                        items.length === 0
                          ? 'New mobile app submissions will appear here automatically.'
                          : 'Try changing your search terms or resetting the active filters.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                currentRecords.map((item, idx) => {
                  return (
                    <tr key={item.id || idx} className="pv-row" style={{ background: 'white' }}>
                      <td style={{ ...s.td, fontWeight: 700, position: 'sticky', left: 0, zIndex: 5, background: 'white', borderRight: '1px solid #f3edfb', boxShadow: '2px 0 5px -2px rgba(0,0,0,0.06)' }}>
                        {item.fullName}
                        <div style={s.sub}>{item.id}</div>
                      </td>
                      <td style={{ ...s.td, fontSize: '12px' }}>
                        {item.email || '—'}
                      </td>
                      <td style={{ ...s.td, fontSize: '12px' }}>
                        {item.contactNumber || item.phone || '—'}
                      </td>
                      <td style={s.td}>
                        {type === 'seller' ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#f37021' }}>{item.storeName || item.businessName || '—'}</div>
                            <div style={s.sub}>{item.address || '—'}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{item.vehicleType || item.vehicle?.type || 'Motorcycle'}</div>
                            <div style={s.sub}>{item.plateNumber || item.vehicle?.plate || '—'}</div>
                          </>
                        )}
                      </td>
                      <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>{formatDate(item.submittedAt)}</td>
                      <td style={s.td}>
                        <Badge tone={item.status === 'Verified' || item.status === 'ACTIVE' || item.status === 'Active' ? 'green' : 'amber'}>
                          {item.status || 'Pending Verification'}
                        </Badge>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <button className="pv-action" style={s.btnPrimary} onClick={() => onReview(item)}>Review</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {sortedItems.length > 0 && (
          <div className="mt-4">
            <PaginationControls
              currentPage={safePage}
              totalRecords={sortedItems.length}
              rowsPerPage={recordsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(n) => {
                setRecordsPerPage(n);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>
    </SectionCard>
  );
};

export default PendingVerificationsTable;
