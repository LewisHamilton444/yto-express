import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { normalizeSeller, normalizeRider, SELLER_STATUS, RIDER_STATUS } from './sellerRiderData';
import { apiFetch, sellersApi, ridersApi, customersApi, parcelsApi } from './services/api';
import Modal from './components/ui/Modal';
import { useToast } from './components/ui/useToast';
import Tooltip from './components/ui/Tooltip';
import Badge from './components/ui/Badge';
import EmptyState from './components/ui/EmptyState';
import TableSkeleton from './components/ui/TableSkeleton';
import DataTable from './components/ui/DataTable';
import FilterBar from './components/ui/FilterBar';
import SectionCard from './components/ui/SectionCard';
import CardFooter from './components/ui/CardFooter';
import PaginationControls from './PaginationControls';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import {
  Archive, Store, Bike, Users, Package, RotateCcw, Trash2, Hash, User, Mail, Phone,
  CreditCard, Activity, CheckCircle, X, AlertTriangle, Eye, Download, Calendar, MapPin,
} from 'lucide-react';

const isTerminalStatus = (status = '') => {
  const s = String(status).toLowerCase();
  return s.includes('delivered') || s.includes('cancelled') || s.includes('returned');
};

export default function SettingsArchiveView({
  onCountsChange = () => {},
  refreshTrigger = 0,
  onLoadingChange = () => {},
  onLoaded = () => {},
}) {
  const [activeTab, setActiveTab] = useState('sellers'); // 'sellers' | 'riders' | 'customers' | 'parcels'
  const [lifecycleFilter, setLifecycleFilter] = useState('archived'); // 'archived' (default) | 'active' | 'all'
  const [datePreset, setDatePreset] = useState('all'); // 'all' | '30d' | '90d' | 'year'
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Collections
  const [allSellers, setAllSellers]     = useState([]);
  const [allRiders, setAllRiders]       = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [allParcels, setAllParcels]     = useState([]);
  const [loading, setLoading]           = useState(true);

  // Modals
  const [confirmArchive, setConfirmArchive] = useState(null); // { kind, record }
  const [confirmDelete, setConfirmDelete]   = useState(null); // { kind, record }
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [auditModalRecord, setAuditModalRecord] = useState(null);

  const toast = useToast();
  const showNotice = (message, type = 'success') => toast(message, type === 'error' ? 'error' : 'success');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    onLoadingChange(true);
    try {
      const [sData, rData, cData, pData] = await Promise.all([
        sellersApi.list().catch(() => []),
        ridersApi.list().catch(() => []),
        customersApi.list().catch(() => []),
        parcelsApi.list().catch(() => []),
      ]);

      const sellers = (Array.isArray(sData) ? sData : []).map(normalizeSeller);
      const riders  = (Array.isArray(rData) ? rData : []).map(normalizeRider);
      const customers = (Array.isArray(cData) ? cData : []).map(c => ({
        _id: c._id,
        customerId: c.customerId || c._id || '—',
        fullName: c.fullName || '—',
        email: c.email || '—',
        phone: c.phone || '—',
        city: c.city || c.address || '—',
        status: (c.status || 'Active').toLowerCase() === 'archived' ? 'ARCHIVED' : (c.status || 'Active'),
        createdAt: c.createdAt,
        raw: c,
      }));
      const parcels = (Array.isArray(pData) ? pData : []).map(p => ({
        _id: p._id,
        trackingNumber: p.trackingNumber || p._id || '—',
        senderName: p.senderName || '—',
        receiverName: p.receiverName || '—',
        destination: p.destination || p.city || '—',
        item: p.item || 'Standard Package',
        status: p.status || 'Pending',
        createdAt: p.createdAt,
        isArchived: isTerminalStatus(p.status),
        raw: p,
      }));

      setAllSellers(sellers);
      setAllRiders(riders);
      setAllCustomers(customers);
      setAllParcels(parcels);

      const counts = {
        sellers: sellers.filter(s => s.status === SELLER_STATUS.ARCHIVED).length,
        riders: riders.filter(r => r.status === RIDER_STATUS.ARCHIVED).length,
        customers: customers.filter(c => c.status === 'ARCHIVED').length,
        parcels: parcels.filter(p => p.isArchived).length,
        activeSellers: sellers.filter(s => s.status !== SELLER_STATUS.ARCHIVED).length,
        activeRiders: riders.filter(r => r.status !== RIDER_STATUS.ARCHIVED).length,
        activeCustomers: customers.filter(c => c.status !== 'ARCHIVED').length,
      };
      onCountsChange(counts);
      onLoaded(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Error fetching archive datasets:', err);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  }, [onCountsChange, onLoadingChange, onLoaded]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshTrigger]);

  // Derived filtered collections
  const currentCollection = useMemo(() => {
    let pool = [];
    if (activeTab === 'sellers') {
      pool = allSellers.map(s => ({
        ...s,
        displayId: s.sellerId,
        primaryName: s.fullName,
        subDetail: s.storeName || s.email,
        contact: s.phone || s.email,
        meta: s.paymentCycle || 'Weekly',
        isArchived: s.status === SELLER_STATUS.ARCHIVED,
      }));
    } else if (activeTab === 'riders') {
      pool = allRiders.map(r => ({
        ...r,
        displayId: r.riderId,
        primaryName: r.fullName,
        subDetail: r.vehicleType || 'Motorcycle',
        contact: r.phone || r.email,
        meta: `${r.performance?.deliveriesCount ?? 0} deliveries`,
        isArchived: r.status === RIDER_STATUS.ARCHIVED,
      }));
    } else if (activeTab === 'customers') {
      pool = allCustomers.map(c => ({
        ...c,
        displayId: c.customerId,
        primaryName: c.fullName,
        subDetail: c.email,
        contact: c.phone || '—',
        meta: c.city || '—',
        isArchived: c.status === 'ARCHIVED',
      }));
    } else {
      pool = allParcels.map(p => ({
        ...p,
        displayId: p.trackingNumber,
        primaryName: `${p.senderName} → ${p.receiverName}`,
        subDetail: p.item,
        contact: p.destination,
        meta: p.status,
        isArchived: p.isArchived,
      }));
    }

    // Filter by Lifecycle State
    if (lifecycleFilter === 'archived') {
      pool = pool.filter(i => i.isArchived);
    } else if (lifecycleFilter === 'active') {
      pool = pool.filter(i => !i.isArchived);
    }

    // Filter by Date Recency
    if (datePreset !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const cutoff = datePreset === '30d' ? now - (30 * dayMs)
                   : datePreset === '90d' ? now - (90 * dayMs)
                   : now - (365 * dayMs);
      pool = pool.filter(i => {
        const date = i.createdAt ? new Date(i.createdAt).getTime() : 0;
        return date >= cutoff;
      });
    }

    // Filter by Search Term
    const term = search.trim().toLowerCase();
    if (term) {
      pool = pool.filter(i =>
        (i.displayId && i.displayId.toLowerCase().includes(term)) ||
        (i.primaryName && i.primaryName.toLowerCase().includes(term)) ||
        (i.subDetail && i.subDetail.toLowerCase().includes(term)) ||
        (i.contact && i.contact.toLowerCase().includes(term)) ||
        (i.email && i.email.toLowerCase().includes(term))
      );
    }

    return pool;
  }, [activeTab, lifecycleFilter, datePreset, search, allSellers, allRiders, allCustomers, allParcels]);

  const totalPages = Math.max(1, Math.ceil(currentCollection.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = currentCollection.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [activeTab, lifecycleFilter, datePreset, search]);

  // Checkbox management
  const allSelectedOnPage = pageRows.length > 0 && pageRows.every(r => selectedIds.has(r._id));
  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allSelectedOnPage) {
      pageRows.forEach(r => next.delete(r._id));
    } else {
      pageRows.forEach(r => next.add(r._id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Actions
  const handleArchive = async (item) => {
    try {
      if (activeTab === 'sellers') {
        const res = await apiFetch(`/sellers/${item._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: SELLER_STATUS.ARCHIVED }),
        });
        if (!res.ok) throw new Error();
      } else if (activeTab === 'riders') {
        const res = await apiFetch(`/riders/${item._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: RIDER_STATUS.ARCHIVED }),
        });
        if (!res.ok) throw new Error();
      } else if (activeTab === 'customers') {
        const res = await apiFetch(`/customers/${item._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Archived' }),
        });
        if (!res.ok) throw new Error();
      }
      showNotice(`${item.primaryName || item.displayId} moved to archives.`);
      setConfirmArchive(null);
      fetchAll();
    } catch {
      showNotice('Failed to archive record.', 'error');
      setConfirmArchive(null);
    }
  };

  const handleRestore = async (item) => {
    try {
      if (activeTab === 'sellers') {
        const res = await apiFetch(`/sellers/${item._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: SELLER_STATUS.ACTIVE }),
        });
        if (!res.ok) throw new Error();
      } else if (activeTab === 'riders') {
        const res = await apiFetch(`/riders/${item._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: RIDER_STATUS.ACTIVE }),
        });
        if (!res.ok) throw new Error();
      } else if (activeTab === 'customers') {
        const res = await apiFetch(`/customers/${item._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Active' }),
        });
        if (!res.ok) throw new Error();
      }
      showNotice(`${item.primaryName || item.displayId} restored to active status.`);
      fetchAll();
    } catch {
      showNotice('Failed to restore record.', 'error');
    }
  };

  const handleDelete = async (item) => {
    try {
      const endpoint = activeTab === 'sellers' ? 'sellers'
                     : activeTab === 'riders' ? 'riders'
                     : 'customers';
      const res = await apiFetch(`/${endpoint}/${item._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showNotice(`${item.primaryName || item.displayId} permanently deleted.`);
      setConfirmDelete(null);
      fetchAll();
    } catch {
      showNotice('Failed to permanently delete record.', 'error');
      setConfirmDelete(null);
    }
  };

  // Bulk actions
  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    const endpoint = activeTab === 'sellers' ? 'sellers'
                   : activeTab === 'riders' ? 'riders'
                   : 'customers';
    const statusVal = activeTab === 'customers' ? 'Active' : 'ACTIVE';
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          apiFetch(`/${endpoint}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: statusVal }),
          })
        )
      );
      showNotice(`${selectedIds.size} records restored successfully.`);
      setSelectedIds(new Set());
      fetchAll();
    } catch {
      showNotice('Failed to restore all selected records.', 'error');
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const endpoint = activeTab === 'sellers' ? 'sellers'
                   : activeTab === 'riders' ? 'riders'
                   : 'customers';
    const statusVal = activeTab === 'customers' ? 'Archived' : 'ARCHIVED';
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          apiFetch(`/${endpoint}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: statusVal }),
          })
        )
      );
      showNotice(`${selectedIds.size} records moved to archives.`);
      setSelectedIds(new Set());
      fetchAll();
    } catch {
      showNotice('Failed to archive selected records.', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const endpoint = activeTab === 'sellers' ? 'sellers'
                   : activeTab === 'riders' ? 'riders'
                   : 'customers';
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          apiFetch(`/${endpoint}/${id}`, { method: 'DELETE' })
        )
      );
      showNotice(`${selectedIds.size} records permanently deleted.`);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      fetchAll();
    } catch {
      showNotice('Failed to delete all selected records.', 'error');
      setConfirmBulkDelete(false);
    }
  };

  const hasActiveFilters = Boolean(search.trim() || lifecycleFilter !== 'archived' || datePreset !== 'all');

  const handleClearFilters = () => {
    setSearch('');
    setLifecycleFilter('archived');
    setDatePreset('all');
  };

  const handleExport = (format) => {
    const exportColumns = [
      { key: 'displayId', label: 'ID' },
      { key: 'primaryName', label: 'Name' },
      { key: 'subDetail', label: 'Detail' },
      { key: 'contact', label: 'Contact' },
      { key: 'meta', label: 'Attribute' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created' },
    ];
    const exportData = currentCollection.map(r => ({
      ...r,
      status: r.isArchived ? 'Archived' : 'Active',
    }));
    const title = `Archive Records - ${activeTab.toUpperCase()}`;
    const filename = `yto_archive_${activeTab}_${lifecycleFilter}`;
    if (format === 'csv') exportToCSV(exportData, exportColumns, filename);
    else if (format === 'excel') exportToExcel(exportData, exportColumns, filename, title);
    else if (format === 'word') exportToWord(exportData, exportColumns, filename, title);
    else if (format === 'pdf') exportToPDF(exportData, exportColumns, filename, title);
  };

  const handleBulkExport = () => {
    const selectedRows = currentCollection.filter(r => selectedIds.has(r._id)).map(r => ({
      ...r,
      status: r.isArchived ? 'Archived' : 'Active',
    }));
    const exportColumns = [
      { key: 'displayId', label: 'ID' },
      { key: 'primaryName', label: 'Name' },
      { key: 'subDetail', label: 'Detail' },
      { key: 'contact', label: 'Contact' },
      { key: 'meta', label: 'Attribute' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Created' },
    ];
    exportToCSV(selectedRows, exportColumns, `yto_selected_${activeTab}`);
  };

  const archivedSellers   = allSellers.filter(s => s.status === SELLER_STATUS.ARCHIVED);
  const archivedRiders    = allRiders.filter(r => r.status === RIDER_STATUS.ARCHIVED);
  const archivedCustomers = allCustomers.filter(c => c.status === 'ARCHIVED');
  const archivedParcels   = allParcels.filter(p => p.isArchived);

  return (
    <div>
      <SectionCard
        icon={Archive}
        title="Archive Management Hub"
        subtitle="Centralized lifecycle directory to inspect, restore, or securely purge archived operational records"
        noPadding
        className="mb-6"
        footer={
          <CardFooter
            resultsLabel={`Showing ${currentCollection.length} matching records`}
            pills={[
              { label: 'Archived Sellers', value: archivedSellers.length, tone: 'purple' },
              { label: 'Archived Riders', value: archivedRiders.length, tone: 'orange' },
              { label: 'Archived Customers', value: archivedCustomers.length, tone: 'blue' },
              { label: 'Archived Shipments', value: archivedParcels.length, tone: 'green' },
            ]}
          />
        }
      >
        {/* ── UNIFIED ENTITY NAVIGATION TABS ── */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-[#e4d8f2] bg-gradient-to-r from-[#faf8fc] to-white overflow-x-auto">
          {[
            { key: 'sellers', label: 'Sellers', icon: Store, count: archivedSellers.length, total: allSellers.length },
            { key: 'riders', label: 'Riders', icon: Bike, count: archivedRiders.length, total: allRiders.length },
            { key: 'customers', label: 'Customers', icon: Users, count: archivedCustomers.length, total: allCustomers.length },
            { key: 'parcels', label: 'Shipments', icon: Package, count: archivedParcels.length, total: allParcels.length },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setActiveTab(tab.key); setSearch(''); setSelectedIds(new Set()); }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#390955] text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-[#cbd5e1] hover:bg-slate-50'
                }`}
              >
                <tab.icon size={14} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-purple-50 text-brand-purple border border-purple-200'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── FILTER & SEARCH BAR ── */}
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              aria-label={`Search ${activeTab}`}
              placeholder={
                activeTab === 'sellers' ? 'Search sellers by ID, name, store, email...' :
                activeTab === 'riders' ? 'Search riders by ID, name, vehicle, phone...' :
                activeTab === 'customers' ? 'Search customers by ID, name, city...' :
                'Search shipments by tracking number, sender, receiver...'
              }
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {/* Lifecycle State Selector */}
            <FilterBar.Select
              aria-label="Filter by lifecycle state"
              value={lifecycleFilter}
              onChange={e => { setLifecycleFilter(e.target.value); setSelectedIds(new Set()); }}
            >
              <option value="archived">Archived Records Only</option>
              <option value="active">Active (Operational / Ready to Archive)</option>
              <option value="all">All Lifecycle States</option>
            </FilterBar.Select>

            {/* Retention Date Preset */}
            <FilterBar.Select
              aria-label="Filter by date retention period"
              value={datePreset}
              onChange={e => setDatePreset(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="year">Past Year</option>
            </FilterBar.Select>

            <FilterBar.Count count={currentCollection.length} label="records" />
          </FilterBar.Group>

          <FilterBar.Actions>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-sm"
              >
                <X size={13} aria-hidden="true" /> Clear Filters
              </button>
            )}

            <ExportDropdown onExport={handleExport} disabled={currentCollection.length === 0} />
          </FilterBar.Actions>
        </FilterBar>

        {/* ── CONTEXTUAL BULK ACTION BAR ── */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mb-3 px-4 py-2.5 rounded-lg bg-[#390955] text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <span className="bg-white/20 px-2 py-0.5 rounded-md text-[11px]">
                {selectedIds.size} selected
              </span>
              <span>Bulk actions available for selected records</span>
            </div>
            <div className="flex items-center gap-2">
              {lifecycleFilter !== 'active' && activeTab !== 'parcels' && (
                <button
                  onClick={handleBulkRestore}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-brand-purple text-xs font-bold hover:bg-purple-50 transition"
                >
                  <RotateCcw size={12} /> Bulk Restore
                </button>
              )}
              {lifecycleFilter === 'active' && activeTab !== 'parcels' && (
                <button
                  onClick={handleBulkArchive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition"
                >
                  <Archive size={12} /> Bulk Archive
                </button>
              )}
              <button
                onClick={handleBulkExport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20"
              >
                <Download size={12} /> Export Selected
              </button>
              {lifecycleFilter !== 'active' && activeTab !== 'parcels' && (
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition"
                >
                  <Trash2 size={12} /> Bulk Delete
                </button>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-white/70 hover:text-white ml-2 underline cursor-pointer"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* ── DATA TABLE ── */}
        <div style={{ padding: '8px 24px 24px' }}>
          <DataTable className="min-w-[1040px]" containerClassName="border border-[#e4d8f2] rounded-xl">
            <DataTable.Head>
              <tr>
                <DataTable.Th stickyLeft className="w-10">
                  <div className="flex items-center gap-2.5">
                    {activeTab !== 'parcels' && (
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleSelectAll}
                        aria-label="Select all on current page"
                        className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple cursor-pointer"
                      />
                    )}
                    <span className="flex items-center gap-1">
                      <Hash size={12} className="text-slate-400" />
                      Identifier
                    </span>
                  </div>
                </DataTable.Th>
                <DataTable.Th>
                  <span className="flex items-center gap-1.5"><User size={12} className="text-slate-400" />Name / Subject</span>
                </DataTable.Th>
                <DataTable.Th>
                  <span className="flex items-center gap-1.5"><Mail size={12} className="text-slate-400" />Contact / Channel</span>
                </DataTable.Th>
                <DataTable.Th>
                  <span className="flex items-center gap-1.5"><Store size={12} className="text-slate-400" />Detail / Location</span>
                </DataTable.Th>
                <DataTable.Th>
                  <span className="flex items-center gap-1.5"><Activity size={12} className="text-slate-400" />Attribute / Activity</span>
                </DataTable.Th>
                <DataTable.Th>
                  <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-slate-400" />Lifecycle Status</span>
                </DataTable.Th>
                <DataTable.Th align="right">Actions</DataTable.Th>
              </tr>
            </DataTable.Head>

            <tbody>
              {loading ? (
                <TableSkeleton rows={6} columns={7} />
              ) : currentCollection.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px 16px' }}>
                    <EmptyState
                      icon={Archive}
                      title={`No ${lifecycleFilter} ${activeTab} records found`}
                      description={
                        search.trim()
                          ? `No records match "${search}". Try adjusting your keywords or clearing filters.`
                          : `There are currently zero ${lifecycleFilter} records under ${activeTab}.`
                      }
                      action={hasActiveFilters ? (
                        <button
                          onClick={handleClearFilters}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-sm"
                        >
                          <X size={13} aria-hidden="true" /> Clear Filters
                        </button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((item) => (
                  <DataTable.Row key={item._id}>
                    <DataTable.Cell stickyLeft className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {activeTab !== 'parcels' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item._id)}
                            onChange={() => toggleSelect(item._id)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Select ${item.displayId}`}
                            className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple cursor-pointer"
                          />
                        )}
                        <span className="font-mono text-xs font-bold text-brand-purple">
                          {item.displayId}
                        </span>
                      </div>
                    </DataTable.Cell>

                    <DataTable.Cell className="whitespace-nowrap">
                      <div className="font-bold text-gray-900 text-xs">{item.primaryName}</div>
                    </DataTable.Cell>

                    <DataTable.Cell className="whitespace-nowrap text-xs text-gray-500">
                      {item.contact || '—'}
                    </DataTable.Cell>

                    <DataTable.Cell className="whitespace-nowrap text-xs text-gray-700">
                      {item.subDetail || '—'}
                    </DataTable.Cell>

                    <DataTable.Cell tabularNums className="whitespace-nowrap text-xs text-gray-700 font-medium">
                      {item.meta || '—'}
                    </DataTable.Cell>

                    <DataTable.Cell className="whitespace-nowrap">
                      <Badge tone={item.isArchived ? 'purple' : 'green'}>
                        {item.isArchived ? 'Archived' : 'Active'}
                      </Badge>
                    </DataTable.Cell>

                    <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-2">
                        {/* Audit Details Modal Trigger */}
                        <button
                          onClick={() => setAuditModalRecord(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-200 text-brand-purple text-xs font-bold hover:bg-purple-50 transition opacity-80 group-hover:opacity-100 whitespace-nowrap"
                          title="View audit information"
                        >
                          <Eye size={12} /> View Audit
                        </button>

                        {/* Lifecycle Action Buttons */}
                        {activeTab !== 'parcels' && (
                          item.isArchived ? (
                            <>
                              <button
                                onClick={() => handleRestore(item)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50/50 text-brand-purple text-xs font-bold hover:bg-purple-100 transition whitespace-nowrap"
                                title="Restore this record to active status"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ kind: activeTab, record: item })}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition whitespace-nowrap"
                                title="Permanently delete this record"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmArchive({ kind: activeTab, record: item })}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition whitespace-nowrap"
                              title="Archive this active record"
                            >
                              <Archive size={12} /> Archive
                            </button>
                          )
                        )}
                      </div>
                    </DataTable.Cell>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable>

          {/* ── PAGINATION CONTROLS INSIDE CARD ── */}
          {!loading && currentCollection.length > 0 && (
            <div className="pt-4">
              <PaginationControls
                currentPage={safePage}
                totalRecords={currentCollection.length}
                rowsPerPage={rowsPerPage}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── AUDIT DETAILS DRAWER / MODAL ── */}
      {auditModalRecord && (
        <Modal tint="rgba(26,6,40,0.55)" blur={false} maxWidth={540} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
          <div className="bg-gradient-to-r from-brand-purple to-[#5a1f80] px-6 py-4 flex items-center justify-between">
            <h3 className="text-white text-sm font-bold m-0 flex items-center gap-2">
              <Eye size={16} className="text-purple-200" />
              Audit Inspector — {auditModalRecord.displayId}
            </h3>
            <button onClick={() => setAuditModalRecord(null)} className="text-white/80 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer">&times;</button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <div className="text-sm font-bold text-gray-900">{auditModalRecord.primaryName}</div>
                <div className="text-xs text-gray-500">{auditModalRecord.contact || 'No contact provided'}</div>
              </div>
              <Badge tone={auditModalRecord.isArchived ? 'purple' : 'green'}>
                {auditModalRecord.isArchived ? 'Archived Record' : 'Active Record'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-400 font-bold block mb-0.5">ENTITY TYPE</span>
                <span className="font-semibold text-slate-800 capitalize">{activeTab}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block mb-0.5">RECORD IDENTIFIER</span>
                <span className="font-mono font-bold text-brand-purple">{auditModalRecord.displayId}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block mb-0.5">SECONDARY DETAIL</span>
                <span className="font-semibold text-slate-800">{auditModalRecord.subDetail || 'None'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block mb-0.5">ATTRIBUTE / ACTIVITY</span>
                <span className="font-semibold text-slate-800">{auditModalRecord.meta || 'None'}</span>
              </div>
              <div className="col-span-2 pt-2 border-t border-slate-200">
                <span className="text-slate-400 font-bold block mb-0.5">CREATED / REGISTERED DATE</span>
                <span className="font-semibold text-slate-800">{auditModalRecord.createdAt ? new Date(auditModalRecord.createdAt).toLocaleString() : 'Historical'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setAuditModalRecord(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition"
              >
                Close
              </button>
              {activeTab !== 'parcels' && (
                auditModalRecord.isArchived ? (
                  <button
                    onClick={() => { handleRestore(auditModalRecord); setAuditModalRecord(null); }}
                    className="px-4 py-2 rounded-lg bg-[#390955] text-white text-xs font-bold hover:bg-[#4a0d6f] transition flex items-center gap-1.5"
                  >
                    <RotateCcw size={12} /> Restore Record
                  </button>
                ) : (
                  <button
                    onClick={() => { setConfirmArchive({ kind: activeTab, record: auditModalRecord }); setAuditModalRecord(null); }}
                    className="px-4 py-2 rounded-lg bg-[#f37021] text-white text-xs font-bold hover:brightness-105 transition flex items-center gap-1.5"
                  >
                    <Archive size={12} /> Archive Record
                  </button>
                )
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── CONFIRM ARCHIVE MODAL ── */}
      {confirmArchive && (
        <Modal tint="rgba(26,6,40,0.55)" blur={false} maxWidth={440} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }}>
          <div className="bg-[#390955] px-6 py-4 flex items-center justify-between">
            <h3 className="text-white text-sm font-bold m-0 flex items-center gap-2">
              <Archive size={16} className="text-purple-300" /> Archive Record
            </h3>
            <button onClick={() => setConfirmArchive(null)} className="text-white/80 hover:text-white text-lg leading-none border-none bg-transparent cursor-pointer">&times;</button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-800 leading-relaxed mb-2">
              Are you sure you want to archive <strong>{confirmArchive.record.primaryName || confirmArchive.record.displayId}</strong>?
            </p>
            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
              This moves the record off the active operational ledger. You can restore it from this archive hub anytime.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmArchive(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchive(confirmArchive.record)}
                className="px-4 py-2 rounded-lg bg-[#f37021] text-white text-xs font-bold hover:brightness-105 transition"
              >
                Archive Record
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CONFIRM SINGLE DELETE MODAL ── */}
      {confirmDelete && (
        <Modal tint="rgba(26,6,40,0.55)" blur={false} maxWidth={440} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }}>
          <div className="bg-red-700 px-6 py-4 flex items-center justify-between">
            <h3 className="text-white text-sm font-bold m-0 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-200" /> Permanently Delete Record
            </h3>
            <button onClick={() => setConfirmDelete(null)} className="text-white/80 hover:text-white text-lg leading-none border-none bg-transparent cursor-pointer">&times;</button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-800 leading-relaxed mb-2">
              Are you sure you want to permanently delete <strong>{confirmDelete.record.primaryName || confirmDelete.record.displayId}</strong>?
            </p>
            <p className="text-xs text-red-600 font-semibold mb-6 leading-relaxed">
              This action cannot be undone and will permanently remove this record from the system database.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.record)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CONFIRM BULK DELETE MODAL ── */}
      {confirmBulkDelete && (
        <Modal tint="rgba(26,6,40,0.55)" blur={false} maxWidth={440} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }}>
          <div className="bg-red-700 px-6 py-4 flex items-center justify-between">
            <h3 className="text-white text-sm font-bold m-0 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-200" /> Bulk Permanent Deletion
            </h3>
            <button onClick={() => setConfirmBulkDelete(false)} className="text-white/80 hover:text-white text-lg leading-none border-none bg-transparent cursor-pointer">&times;</button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-800 leading-relaxed mb-2">
              Are you sure you want to permanently delete all <strong>{selectedIds.size} selected records</strong>?
            </p>
            <p className="text-xs text-red-600 font-semibold mb-6 leading-relaxed">
              This action cannot be undone. All selected records will be erased from the database forever.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition"
              >
                Delete {selectedIds.size} Records
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
