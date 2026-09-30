import React, { useState } from 'react';
import EmptyState from '../components/ui/EmptyState';
import SectionCard from '../components/ui/SectionCard';
import CardSectionHeader from '../components/ui/CardSectionHeader';
import LedgerStatus from '../components/ui/LedgerStatus';
import FilterBar from '../components/ui/FilterBar';
import PaginationControls from '../PaginationControls';
import { User, Mail, Phone, Store, Truck, Bike, Calendar, Activity, RotateCcw, ClipboardCheck } from 'lucide-react';
import { initialsOf, statusTone } from '../ledger';
import { formatStatusLabel } from '../sellerRiderData';
import '../LedgerPage.css';

// Treat the placeholder dashes some synced records carry as "no value".
const clean = (v) => {
  const t = String(v ?? '').trim();
  return t === '—' || t === '-' ? '' : t;
};

// 'Pending' / 'pending_verification' → the canonical enum key the shared
// label map knows ('PENDING_VERIFICATION' → 'Pending Verification').
const normalizeStatusKey = (status) => {
  const v = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!v || v === 'PENDING') return 'PENDING_VERIFICATION';
  return v;
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

  const withCaption = (caption, select) => (
    <label className="lp-select-field">
      <span className="lp-select-caption">{caption}</span>
      {select}
    </label>
  );

  return (
    <SectionCard
      noPadding
      className="lp-card"
      bodyClassName="lp-card-body"
      footer={sortedItems.length > 0 ? (
        <div className="lp-footer">
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
      ) : null}
    >
      <div className="lp-section-head">
        <CardSectionHeader
          icon={type === 'seller' ? Store : Bike}
          title={`Pending ${label} Registrations`}
          subtitle={type === 'seller'
            ? 'New merchant sign-ups from the mobile app, waiting for approval'
            : 'New rider sign-ups from the mobile app, waiting for approval'}
        />
      </div>

      {/* Search, filters (each captioned so the two "All" menus are
          distinguishable), count and reset — one aligned row. */}
      <FilterBar className="lp-toolbar">
        <FilterBar.Group>
          <FilterBar.Search
            placeholder={type === 'seller' ? 'Search name, store, email or phone...' : 'Search name, plate, email or phone...'}
            aria-label={`Search pending ${label.toLowerCase()} registrations`}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
          {withCaption('Submitted', (
            <FilterBar.Select
              aria-label="Filter by submission date"
              value={timeframeFilter}
              onChange={(e) => { setTimeframeFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All</option>
              <option value="today" className="font-medium text-slate-700 bg-white">Today</option>
              <option value="week" className="font-medium text-slate-700 bg-white">Past 7 Days</option>
              <option value="month" className="font-medium text-slate-700 bg-white">Past 30 Days</option>
            </FilterBar.Select>
          ))}
          {withCaption(type === 'seller' ? 'Store' : 'Vehicle', (
            <FilterBar.Select
              aria-label={type === 'seller' ? 'Filter by store details' : 'Filter by vehicle details'}
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
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
          ))}
          {withCaption('Sort', (
            <FilterBar.Select
              aria-label="Sort registrations"
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
            >
              <option value="newest" className="font-medium text-slate-700 bg-white">Newest First</option>
              <option value="oldest" className="font-medium text-slate-700 bg-white">Oldest First</option>
              <option value="name" className="font-medium text-slate-700 bg-white">Applicant Name (A-Z)</option>
            </FilterBar.Select>
          ))}
          <span className="lp-count">
            <strong>{sortedItems.length}</strong> awaiting review
          </span>
        </FilterBar.Group>

        {hasActiveFilters && (
          <FilterBar.Actions>
            <button type="button" onClick={resetFilters} className="lp-btn is-secondary">
              <RotateCcw size={12} aria-hidden="true" /> Reset
            </button>
          </FilterBar.Actions>
        )}
      </FilterBar>

      <div className="lp-table-scroll custom-table-scroll">
        <table className="lp-table lp-table--review w-full text-left">
          <thead>
            <tr>
              {[
                { label: 'Applicant', icon: User },
                { label: 'Email Address', icon: Mail },
                { label: 'Phone Number', icon: Phone },
                type === 'seller' ? { label: 'Store', icon: Store } : { label: 'Vehicle', icon: Truck },
                { label: 'Submitted', icon: Calendar },
                { label: 'Status', icon: Activity },
              ].map((h) => (
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
                <td colSpan={7} style={{ padding: '32px 16px' }}>
                  <EmptyState
                    title={items.length === 0 ? `No pending ${label.toLowerCase()} registrations` : 'No matching registrations found'}
                    description={items.length === 0
                      ? 'New mobile app submissions will appear here automatically.'
                      : 'Try changing your search terms or resetting the active filters.'}
                  />
                </td>
              </tr>
            ) : (
              currentRecords.map((item, idx) => {
                const storeName = clean(item.storeName || item.businessName);
                const address = clean(item.address);
                const vehicle = clean(item.vehicleType || item.vehicle?.type) || 'Motorcycle';
                const plate = clean(item.plateNumber || item.vehicle?.plate);
                return (
                  <tr key={item.id || idx} className="group cursor-pointer" onClick={() => onReview(item)}>
                    <td className="whitespace-nowrap">
                      <span className="lp-name">
                        <span className="lp-avatar" aria-hidden="true">{initialsOf(item.fullName)}</span>
                        <span className="lp-stack">
                          <span className="lp-name-text">{item.fullName || 'Unnamed applicant'}</span>
                          <span className="lp-stack-sub lp-mono">{item.id}</span>
                        </span>
                      </span>
                    </td>
                    <td className="lp-muted lp-email whitespace-nowrap" title={item.email || undefined}>{item.email || '—'}</td>
                    <td className="lp-muted whitespace-nowrap tabular-nums">{item.contactNumber || item.phone || '—'}</td>
                    <td className="whitespace-nowrap">
                      {type === 'seller' ? (
                        <span className="lp-stack lp-clip" title={[storeName, address].filter(Boolean).join(' — ') || undefined}>
                          <span className={`lp-stack-main${storeName ? ' lp-accent' : ' lp-placeholder'}`}>{storeName || 'No store name yet'}</span>
                          {address && <span className="lp-stack-sub">{address}</span>}
                        </span>
                      ) : (
                        <span className="lp-stack lp-clip">
                          <span className="lp-stack-main">{vehicle}</span>
                          {plate && <span className="lp-stack-sub lp-mono">{plate}</span>}
                        </span>
                      )}
                    </td>
                    <td className="lp-muted whitespace-nowrap tabular-nums">{formatDate(item.submittedAt)}</td>
                    <td className="whitespace-nowrap">
                      <LedgerStatus tone={statusTone(item.status)}>{formatStatusLabel(normalizeStatusKey(item.status))}</LedgerStatus>
                    </td>
                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="lp-review-btn" onClick={() => onReview(item)} aria-label={`Review ${item.fullName || 'application'}`}>
                        <ClipboardCheck size={14} aria-hidden="true" /> Review
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};

export default PendingVerificationsTable;
