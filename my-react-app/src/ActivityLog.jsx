import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './services/api';
import useSSE from './services/useSSE';
import SectionCard from './components/ui/SectionCard';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import CardFooter from './components/ui/CardFooter';
import StatCard from './components/ui/StatCard';
import DataTable from './components/ui/DataTable';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import FilterBar from './components/ui/FilterBar';
import Modal from './components/ui/Modal';
import PaginationControls from './PaginationControls';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import {
  History, X, UserPlus, RefreshCcw, Package, Bike, Store, ShieldCheck,
  AlertTriangle, Hash, User, Shield, Activity, FileText, CheckCircle,
  Calendar, Eye, Copy, Check, Users, Clock,
} from 'lucide-react';

const ROLE_TONE = {
  customer: 'blue',
  seller:   'amber',
  rider:    'green',
  admin:    'violet',
};

const TYPE_CONFIG = {
  registration:  { label: 'Registration',      icon: UserPlus,      tone: 'blue' },
  status_change: { label: 'Status Update',     icon: RefreshCcw,    tone: 'purple' },
  order:         { label: 'Shipment Booking',  icon: Package,       tone: 'amber' },
  delivery:      { label: 'Logistics Action',  icon: Bike,          tone: 'green' },
  issue:         { label: 'Issue Ticket',      icon: AlertTriangle, tone: 'red' },
};

const TABLE_HEADERS = [
  { label: 'Reference ID',     icon: Hash },
  { label: 'Admin Role',       icon: Shield },
  { label: 'Activity Type',    icon: Activity },
  { label: 'Activity Summary', icon: FileText },
  { label: 'Status',           icon: CheckCircle },
  { label: 'Date & Time',      icon: Calendar },
  { label: 'Actions',          icon: null },
];

const ACTIVITY_EXPORT_COLUMNS = [
  { key: 'actorId',       label: 'Reference ID' },
  { key: 'adminRole',     label: 'Admin Role' },
  { key: 'typeLabel',     label: 'Activity Type' },
  { key: 'description',   label: 'Activity Summary' },
  { key: 'status',        label: 'Status' },
  { key: 'formattedTime', label: 'Date & Time' },
];

export default function ActivityLog() {
  const [events, setEvents]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'delivery' | 'order' | 'customer' | 'admin'
  const [searchTerm, setSearchTerm]     = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [datePreset, setDatePreset]     = useState('all'); // 'all' | 'today' | '7d' | '30d' | '90d'
  const [currentPage, setCurrentPage]   = useState(1);
  const [rowsPerPage, setRowsPerPage]   = useState(10);
  const [detailEvent, setDetailEvent]   = useState(null);
  const [copiedId, setCopiedId]         = useState(false);
  const [lastUpdated, setLastUpdated]   = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const { lastEvent } = useSSE();

  useEffect(() => {
    fetchEvents();
  }, []);

  // Real-time synchronization: automatically re-fetch activity stream when events occur
  useEffect(() => {
    if (lastEvent) {
      fetchEvents();
    }
  }, [lastEvent]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/activity-log?limit=300');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Error fetching activity log:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Category & Filter processing
  const filtered = useMemo(() => {
    let pool = events;

    // Category Scope
    if (activeCategory === 'delivery') {
      pool = pool.filter(e => e.type === 'delivery' || e.role === 'rider');
    } else if (activeCategory === 'order') {
      pool = pool.filter(e => e.type === 'order' || e.role === 'seller');
    } else if (activeCategory === 'customer') {
      pool = pool.filter(e => e.role === 'customer' || e.type === 'issue');
    } else if (activeCategory === 'admin') {
      pool = pool.filter(e => e.role === 'admin');
    }

    // Type Filter
    if (typeFilter !== 'all') {
      pool = pool.filter(e => e.type === typeFilter);
    }

    // Date Preset Filter
    if (datePreset !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let cutoff = 0;
      if (datePreset === 'today') {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
      } else if (datePreset === '7d') {
        cutoff = now - (7 * dayMs);
      } else if (datePreset === '30d') {
        cutoff = now - (30 * dayMs);
      } else if (datePreset === '90d') {
        cutoff = now - (90 * dayMs);
      }
      pool = pool.filter(e => {
        const time = e.timestamp ? new Date(e.timestamp).getTime() : 0;
        return time >= cutoff;
      });
    }

    // Keyword Search
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      pool = pool.filter(e =>
        (e.actorName && e.actorName.toLowerCase().includes(term)) ||
        (e.actorId && e.actorId.toLowerCase().includes(term)) ||
        (e.description && e.description.toLowerCase().includes(term)) ||
        (e.status && e.status.toLowerCase().includes(term)) ||
        (e.role && e.role.toLowerCase().includes(term))
      );
    }

    return pool;
  }, [events, activeCategory, typeFilter, datePreset, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, typeFilter, datePreset, searchTerm]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  };

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1600);
  };

  const hasActiveFilters = Boolean(searchTerm || typeFilter !== 'all' || datePreset !== 'all' || activeCategory !== 'all');

  const handleClearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setDatePreset('all');
    setActiveCategory('all');
  };

  const handleExport = (format) => {
    const exportData = filtered.map(e => ({
      actorId: e.actorId || '—',
      adminRole: `${e.actorName || 'System'} (${e.role ? e.role.charAt(0).toUpperCase() + e.role.slice(1) : 'Admin'})`,
      typeLabel: TYPE_CONFIG[e.type]?.label || e.type,
      description: e.description || '',
      status: e.status || 'Active',
      formattedTime: formatDate(e.timestamp),
    }));
    const title = 'Activity Log';
    const filename = `yto_activity_log_${activeCategory}`;
    if (format === 'csv') exportToCSV(exportData, ACTIVITY_EXPORT_COLUMNS, filename);
    else if (format === 'excel') exportToExcel(exportData, ACTIVITY_EXPORT_COLUMNS, filename, title);
    else if (format === 'word') exportToWord(exportData, ACTIVITY_EXPORT_COLUMNS, filename, title);
    else if (format === 'pdf') exportToPDF(exportData, ACTIVITY_EXPORT_COLUMNS, filename, title);
  };

  const stats = useMemo(() => ({
    total: events.length,
    deliveries: events.filter(e => e.type === 'delivery' || e.role === 'rider').length,
    orders: events.filter(e => e.type === 'order' || e.role === 'seller').length,
    customers: events.filter(e => e.role === 'customer' || e.type === 'issue').length,
    admin: events.filter(e => e.role === 'admin').length,
  }), [events]);

  const renderHighlightedDescription = (desc = '') => {
    const trackingMatch = desc.match(/\b(YTO[A-Za-z0-9_-]+)\b/);
    if (!trackingMatch) return <span>{desc}</span>;

    const parts = desc.split(trackingMatch[0]);
    return (
      <span>
        {parts[0]}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(trackingMatch[0]);
          }}
          title="Click to copy tracking reference"
          className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-[#f37021] font-mono font-bold text-[11px] border border-amber-200/60 mx-1 hover:bg-amber-100 transition cursor-pointer"
        >
          {trackingMatch[0]}
        </button>
        {parts[1]}
      </span>
    );
  };

  return (
    <div className="p-6 md:p-8 w-full space-y-6">
      <PageHeader
        title="Activity Log"
        subtitle="Chronological audit stream of activities across customer, seller, rider, and administrative domains"
        breadcrumb={['Dashboard', 'Admin', 'Activity Log']}
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-400 font-medium">Updated {lastUpdated}</span>
            )}
            <RefreshButton onClick={fetchEvents} isRefreshing={loading} />
          </div>
        }
      />

      {/* ── TOP METRIC GRID ── */}
      <StatCard.Grid cols={4} className="mb-6">
        <StatCard
          label="Total Activities"
          value={stats.total}
          sub="Cross-domain logged audit events"
          tone="purple"
          trend="Total"
          trendTone="neutral"
        />
        <StatCard
          label="Riders & Logistics"
          value={stats.deliveries}
          sub="Rider pickups and milestone events"
          tone="emerald"
          trend={stats.deliveries > 0 ? 'Active' : 'None'}
          trendTone="positive"
        />
        <StatCard
          label="Shipment Bookings"
          value={stats.orders}
          sub="Merchant-generated parcels"
          tone="blue"
          trend="Bookings"
          trendTone="neutral"
        />
        <StatCard
          label="Administrative Events"
          value={stats.admin}
          sub="Accounts and governance changes"
          tone="amber"
          trend={stats.admin > 0 ? 'Audit' : 'Clean'}
          trendTone="neutral"
        />
      </StatCard.Grid>

      {/* ── MAIN LEDGER CARD ── */}
      <SectionCard
        icon={History}
        title="Activity Audit Log"
        subtitle="Real-time timeline tracking actions, status milestones, and user operations"
        noPadding
        className="mb-6"
        footer={
          <CardFooter
            resultsLabel={`Showing ${filtered.length} of ${events.length} activities`}
            pills={[
              { label: 'Logistics', value: stats.deliveries, tone: 'green' },
              { label: 'Bookings', value: stats.orders, tone: 'blue' },
              { label: 'Customer Actions', value: stats.customers, tone: 'purple' },
              { label: 'Administrative', value: stats.admin, tone: 'amber' },
            ]}
          />
        }
      >
        {/* ── CATEGORY DOMAIN TABS ── */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-[#e4d8f2] bg-gradient-to-r from-[#faf8fc] to-white overflow-x-auto">
          {[
            { key: 'all', label: 'All Activities', icon: History, count: stats.total },
            { key: 'delivery', label: 'Riders & Logistics', icon: Bike, count: stats.deliveries },
            { key: 'order', label: 'Shipment Bookings', icon: Package, count: stats.orders },
            { key: 'customer', label: 'Customer Actions', icon: Users, count: stats.customers },
            { key: 'admin', label: 'Administrative', icon: ShieldCheck, count: stats.admin },
          ].map(tab => {
            const isActive = activeCategory === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveCategory(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#390955] text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-[#cbd5e1] hover:bg-slate-50'
                }`}
              >
                <tab.icon size={13} className={isActive ? 'text-white' : 'text-slate-400'} />
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

        {/* ── STREAMLINED FILTER BAR ── */}
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              aria-label="Search activity logs"
              placeholder="Search by actor, ID, tracking number, or keyword..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />

            {/* Activity Type Dropdown */}
            <FilterBar.Select
              aria-label="Filter by activity category"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">All Activity Types</option>
              <option value="registration">Registrations</option>
              <option value="status_change">Status Updates</option>
              <option value="order">Shipment Bookings</option>
              <option value="delivery">Logistics Actions</option>
              <option value="issue">Issue Tickets</option>
            </FilterBar.Select>

            {/* Time Period Preset Dropdown */}
            <FilterBar.Select
              aria-label="Filter by time period"
              value={datePreset}
              onChange={e => setDatePreset(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </FilterBar.Select>

            <FilterBar.Count count={filtered.length} label="events" />
          </FilterBar.Group>

          <FilterBar.Actions>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <X size={13} aria-hidden="true" /> Clear Filters
              </button>
            )}

            <ExportDropdown onExport={handleExport} disabled={filtered.length === 0} />
          </FilterBar.Actions>
        </FilterBar>

        {/* ── DATA TABLE ── */}
        <div style={{ padding: '8px 24px 24px' }}>
          <DataTable className="min-w-[1080px]" containerClassName="border border-[#e4d8f2] rounded-xl">
            <DataTable.Head>
              <tr>
                {TABLE_HEADERS.map((h, idx) => (
                  <DataTable.Th
                    key={h.label}
                    className="whitespace-nowrap"
                    stickyLeft={idx === 0}
                    align={idx === TABLE_HEADERS.length - 1 ? 'right' : 'left'}
                  >
                    {h.label === 'Actions' ? (
                      <span>{h.label}</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <h.icon size={12} className="text-slate-400" />
                        {h.label}
                      </span>
                    )}
                  </DataTable.Th>
                ))}
              </tr>
            </DataTable.Head>

            <tbody>
              {loading ? (
                <TableSkeleton rows={6} columns={TABLE_HEADERS.length} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} style={{ padding: '36px 16px' }}>
                    <EmptyState
                      icon={History}
                      title="No activity events found"
                      description={
                        searchTerm.trim()
                          ? `No activity events match "${searchTerm}". Try different keywords or clear your filters.`
                          : 'No activity logs have been recorded in this category yet.'
                      }
                      action={
                        hasActiveFilters ? (
                          <button
                            onClick={handleClearFilters}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            <X size={13} aria-hidden="true" /> Clear Filters
                          </button>
                        ) : null
                      }
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((evt, idx) => {
                  const typeCfg = TYPE_CONFIG[evt.type] || { label: evt.type || 'Activity', icon: Activity, tone: 'slate' };
                  const TypeIcon = typeCfg.icon;

                  return (
                    <DataTable.Row
                      key={evt._id || idx}
                      onClick={() => setDetailEvent(evt)}
                      className="cursor-pointer group"
                    >
                      {/* Sticky Reference ID */}
                      <DataTable.Cell stickyLeft className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-brand-purple">
                            {evt.actorId || '—'}
                          </span>
                          {evt.actorId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(evt.actorId);
                              }}
                              title="Copy Reference ID"
                              className="p-1 rounded hover:bg-purple-100 text-slate-400 hover:text-brand-purple transition opacity-0 group-hover:opacity-100 cursor-pointer"
                            >
                              <Copy size={11} />
                            </button>
                          )}
                        </div>
                      </DataTable.Cell>

                      {/* Admin Role */}
                      <DataTable.Cell className="whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#390955] to-[#5a1f80] flex items-center justify-center text-xs font-extrabold text-white shrink-0 shadow-xs">
                            {evt.actorName ? evt.actorName.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-xs">{evt.actorName || 'System'}</div>
                            <div className="mt-0.5">
                              <Badge tone={ROLE_TONE[evt.role] || 'slate'}>
                                {evt.role ? evt.role.charAt(0).toUpperCase() + evt.role.slice(1) : 'Admin'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </DataTable.Cell>

                      {/* Activity Type */}
                      <DataTable.Cell className="whitespace-nowrap">
                        <Badge tone={typeCfg.tone}>
                          <span className="flex items-center gap-1">
                            <TypeIcon size={11} />
                            {typeCfg.label}
                          </span>
                        </Badge>
                      </DataTable.Cell>

                      {/* Activity Summary */}
                      <DataTable.Cell className="text-xs text-gray-700 max-w-sm">
                        <div className="line-clamp-2 leading-relaxed" title={evt.description}>
                          {renderHighlightedDescription(evt.description)}
                        </div>
                      </DataTable.Cell>

                      {/* Status */}
                      <DataTable.Cell className="whitespace-nowrap">
                        <Badge tone={
                          evt.status === 'Active' || evt.status === 'Delivered' || evt.status === 'Resolved' ? 'green' :
                          evt.status === 'Pending' || evt.status === 'Investigating' ? 'amber' :
                          evt.status === 'Cancelled' || evt.status === 'Failed' ? 'red' : 'purple'
                        }>
                          {evt.status || 'Active'}
                        </Badge>
                      </DataTable.Cell>

                      {/* Date & Time */}
                      <DataTable.Cell tabularNums className="whitespace-nowrap text-xs">
                        <div className="font-bold text-gray-800">{formatTimeAgo(evt.timestamp)}</div>
                        <div className="text-[11px] text-gray-400">{formatDate(evt.timestamp)}</div>
                      </DataTable.Cell>

                      {/* Actions */}
                      <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDetailEvent(evt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-brand-purple text-xs font-bold hover:bg-purple-50 transition opacity-80 group-hover:opacity-100 whitespace-nowrap cursor-pointer"
                        >
                          <Eye size={12} /> View Event
                        </button>
                      </DataTable.Cell>
                    </DataTable.Row>
                  );
                })
              )}
            </tbody>
          </DataTable>

          {/* ── PAGINATION CONTROLS INSIDE CARD ── */}
          {!loading && filtered.length > 0 && (
            <div className="pt-4">
              <PaginationControls
                currentPage={safePage}
                totalRecords={filtered.length}
                rowsPerPage={rowsPerPage}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── RICH EVENT DETAIL MODAL ── */}
      {detailEvent && (
        <Modal
          tint="rgba(26,6,40,0.55)"
          blur={false}
          maxWidth={540}
          padding={0}
          cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
        >
          <div className="bg-gradient-to-r from-brand-purple to-[#5a1f80] px-6 py-4 flex items-center justify-between">
            <h3 className="text-white text-sm font-bold m-0 flex items-center gap-2">
              <Eye size={16} className="text-purple-200" /> Activity Details
            </h3>
            <button
              onClick={() => setDetailEvent(null)}
              className="text-white/80 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
            >
              &times;
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Header Identity Block */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#390955] to-[#5a1f80] flex items-center justify-center text-sm font-extrabold text-white shrink-0 shadow-sm">
                  {detailEvent.actorName ? detailEvent.actorName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{detailEvent.actorName || 'Unspecified User'}</div>
                  <div className="text-xs text-gray-500 font-mono">Reference ID: {detailEvent.actorId || '—'}</div>
                </div>
              </div>
              <Badge tone={ROLE_TONE[detailEvent.role] || 'slate'}>
                {detailEvent.role ? detailEvent.role.charAt(0).toUpperCase() + detailEvent.role.slice(1) : 'Admin'}
              </Badge>
            </div>

            {/* Key Information Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-400 font-bold block mb-0.5">ACTIVITY TYPE</span>
                <span className="font-semibold text-slate-800 capitalize">
                  {TYPE_CONFIG[detailEvent.type]?.label || detailEvent.type || 'Activity'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block mb-0.5">STATUS</span>
                <span className="font-semibold text-slate-800">{detailEvent.status || 'Active'}</span>
              </div>
              <div className="col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 font-bold block mb-0.5">DATE & TIME</span>
                  <span className="font-semibold text-slate-800">{formatDate(detailEvent.timestamp)}</span>
                </div>
                <span className="text-[11px] text-brand-purple font-bold">
                  {formatTimeAgo(detailEvent.timestamp)}
                </span>
              </div>
            </div>

            {/* Detailed Description Block */}
            <div>
              <span className="text-xs font-bold text-gray-700 block mb-1.5">Activity Description</span>
              <div className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-800 leading-relaxed">
                {renderHighlightedDescription(detailEvent.description)}
              </div>
            </div>

            {/* Quick Identifier Copy (if available) */}
            {detailEvent.actorId && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">Reference code:</span>
                <button
                  type="button"
                  onClick={() => handleCopy(detailEvent.actorId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 transition cursor-pointer"
                >
                  {copiedId ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  {copiedId ? 'Copied' : 'Copy Reference ID'}
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => setDetailEvent(null)}
                className="px-5 py-2 rounded-lg bg-[#390955] text-white text-xs font-bold hover:bg-[#4a0d6f] transition"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
