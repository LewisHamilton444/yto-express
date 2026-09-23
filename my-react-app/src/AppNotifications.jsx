import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './services/api';
import PageHeader from './components/ui/PageHeader';
import CardFooter from './components/ui/CardFooter';
import SectionCard from './components/ui/SectionCard';
import ListSkeleton from './components/ui/ListSkeleton';
import EmptyState from './components/ui/EmptyState';
import Badge from './components/ui/Badge';
import PaginationControls from './PaginationControls';
import FilterBar from './components/ui/FilterBar';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import StatCard from './components/ui/StatCard';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import useSSE from './services/useSSE';
import {
  Search, Copy, Check, CheckCheck, Bell,
  Package, Truck, AlertTriangle, UserCheck, Calendar,
  X, CheckCircle2,
} from 'lucide-react';

const ROLE_TONE = {
  customer: { label: 'Customer', tone: 'blue' },
  seller:   { label: 'Seller',   tone: 'amber' },
  rider:    { label: 'Rider',    tone: 'green' },
  admin:    { label: 'Admin',    tone: 'violet' },
};

const NOTIFICATION_EXPORT_COLUMNS = [
  { key: 'reference', label: 'Reference / ID' },
  { key: 'title', label: 'Title' },
  { key: 'message', label: 'Notification Message' },
  { key: 'role', label: 'Target Audience' },
  { key: 'type', label: 'Notification Type' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Date & Time' },
];

const TYPE_LABELS = {
  order_update: 'Order Update',
  new_order: 'New Order',
  system_alert: 'System Alert',
  system: 'System',
  security: 'Security',
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const now = new Date();
  const date = new Date(dateStr);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getNotificationIcon(type, role) {
  if (type === 'new_order') return { icon: Package, bg: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
  if (type === 'order_update') return { icon: Truck, bg: 'bg-blue-50 text-blue-600 border-blue-200' };
  if (type === 'system_alert' || type === 'security') return { icon: AlertTriangle, bg: 'bg-red-50 text-red-600 border-red-200' };
  if (role === 'customer') return { icon: UserCheck, bg: 'bg-sky-50 text-sky-600 border-sky-200' };
  if (role === 'rider') return { icon: Truck, bg: 'bg-purple-50 text-purple-600 border-purple-200' };
  return { icon: Bell, bg: 'bg-slate-50 text-slate-600 border-slate-200' };
}

export default function AppNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [roleFilter,    setRoleFilter]    = useState('all');
  const [typeFilter,    setTypeFilter]    = useState('all');
  const [dateFilter,    setDateFilter]    = useState('all');
  const [activeSegment, setActiveSegment] = useState('all');
  const [searchTerm,    setSearchTerm]    = useState('');
  const [currentPage,   setCurrentPage]   = useState(1);
  const [rowsPerPage,   setRowsPerPage]   = useState(15);
  const [copiedId,      setCopiedId]      = useState(null);
  const [lastUpdated, setLastUpdated]     = useState('');

  // Server is the source of truth for read state: PATCH /api/notifications/:id/read
  const [readIds, setReadIds] = useState([]);
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read && !readIds.includes(n._id)).length;
  }, [notifications, readIds]);

  const orderEventsCount = useMemo(() => {
    return notifications.filter(n => ['order_update', 'new_order'].includes(n.type)).length;
  }, [notifications]);

  const systemEventsCount = useMemo(() => {
    return notifications.filter(n =>
      ['system_alert', 'system', 'security'].includes(n.type) ||
      (n.relatedId && n.relatedId.startsWith('TICK-'))
    ).length;
  }, [notifications]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return notifications.filter(n => (n.createdAt || '').slice(0, 10) === today).length;
  }, [notifications]);

  const markOneRead = async (id) => {
    if (!id) return;
    setReadIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    } catch { /* optimistic: server re-syncs on next fetch */ }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read && !readIds.includes(n._id));
    if (unread.length === 0) return;
    setReadIds(prev => [...prev, ...unread.map(n => n._id)]);
    await Promise.allSettled(unread.map(n => apiFetch(`/notifications/${n._id}/read`, { method: 'PATCH' })));
    fetchNotifications();
  };

  const fetchNotifications = async () => {
    try {
      const res = await apiFetch('/notifications?limit=200');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  // Real-time updates: refresh feed on SSE notification-synced
  const { on } = useSSE();
  useEffect(() => {
    const unsub = on('notification-synced', () => fetchNotifications());
    return unsub;
  }, [on]);

  const handleCopyRef = (e, refId) => {
    e.stopPropagation();
    if (!refId) return;
    navigator.clipboard.writeText(refId).then(() => {
      setCopiedId(refId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const filtered = useMemo(() => {
    // Declared inside the memo: it reads `dateFilter`, which is already a
    // dependency, so a separate component-scope helper would only add an
    // unstable identity to the closure.
    const matchesDate = (dateStr) => {
      if (dateFilter === 'all' || !dateStr) return true;
      const itemDate = new Date(dateStr);
      const now = new Date();
      const diffMs = now - itemDate;
      if (dateFilter === 'today') {
        return itemDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
      }
      if (dateFilter === 'week') {
        return diffMs <= 7 * 24 * 60 * 60 * 1000;
      }
      if (dateFilter === 'month') {
        return diffMs <= 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    };

    const q = searchTerm.toLowerCase().trim();
    return notifications.filter(n => {
      const isUnread = !n.read && !readIds.includes(n._id);

      // Segment filter
      if (activeSegment === 'unread' && !isUnread) return false;
      if (activeSegment === 'read' && isUnread) return false;
      if (activeSegment === 'orders' && !['order_update', 'new_order'].includes(n.type)) return false;
      if (activeSegment === 'system' && !(['system_alert', 'system', 'security'].includes(n.type) || (n.relatedId && n.relatedId.startsWith('TICK-')))) return false;

      // Dropdown filters
      if (roleFilter !== 'all' && n.role !== roleFilter) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (!matchesDate(n.createdAt)) return false;

      // Search term
      if (q) {
        const matches =
          n.title?.toLowerCase().includes(q) ||
          n.message?.toLowerCase().includes(q) ||
          n.relatedId?.toLowerCase().includes(q) ||
          n.role?.toLowerCase().includes(q) ||
          (TYPE_LABELS[n.type] || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [notifications, readIds, activeSegment, roleFilter, typeFilter, dateFilter, searchTerm]);

  const pageRows = useMemo(() => {
    return filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filtered, currentPage, rowsPerPage]);

  const hasActiveFilters = searchTerm || roleFilter !== 'all' || typeFilter !== 'all' || dateFilter !== 'all' || activeSegment !== 'all';

  const handleClearFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setTypeFilter('all');
    setDateFilter('all');
    setActiveSegment('all');
    setCurrentPage(1);
  };

  const handleExport = (format) => {
    const exportData = filtered.map(n => ({
      reference: n.relatedId || n._id,
      title: n.title || 'Notification',
      message: n.message || '',
      role: ROLE_TONE[n.role]?.label || n.role,
      type: TYPE_LABELS[n.type] || n.type,
      status: !n.read && !readIds.includes(n._id) ? 'Unread' : 'Acknowledged',
      createdAt: formatDate(n.createdAt),
    }));
    const filename = `app_notifications_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'excel') {
      exportToExcel(exportData, NOTIFICATION_EXPORT_COLUMNS, filename);
    } else if (format === 'word') {
      exportToWord(exportData, NOTIFICATION_EXPORT_COLUMNS, filename, 'App Notifications Feed Report');
    } else if (format === 'pdf') {
      exportToPDF(exportData, NOTIFICATION_EXPORT_COLUMNS, filename, 'App Notifications Feed Report');
    } else {
      exportToCSV(exportData, NOTIFICATION_EXPORT_COLUMNS, filename);
    }
  };

  const segmentTabs = [
    { id: 'all', label: 'All', count: notifications.length },
    { id: 'unread', label: 'Unread Alerts', count: unreadCount },
    { id: 'read', label: 'Acknowledged', count: Math.max(0, notifications.length - unreadCount) },
    { id: 'orders', label: 'Orders & Deliveries', count: orderEventsCount },
    { id: 'system', label: 'System & Issues', count: systemEventsCount },
  ];

  return (
    <div className="yto-page-container w-full space-y-6">
      <PageHeader
        title="App Notifications"
        subtitle="Real events pushed from the mobile network — bookings, pickups, deliveries, POD uploads and issue tickets"
        breadcrumb={['Dashboard', 'Support', 'App Notifications']}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {lastUpdated && <span className="text-[11px] text-slate-400 font-mono">Updated {lastUpdated}</span>}
            <RefreshButton
              onClick={fetchNotifications}
              isRefreshing={loading}
            />
          </div>
        }
      />

      {/* KPI Overview Summary Strip */}
      <StatCard.Grid cols={4} className="mb-6">
        <StatCard
          label="Total Feed Volume"
          value={notifications.length}
          sub="Recorded notification events"
          tone="purple"
          trend="Total"
          trendTone="neutral"
        />
        <StatCard
          label="Unread Alerts"
          value={unreadCount}
          sub={unreadCount > 0 ? "Pending acknowledgment" : "All alerts acknowledged"}
          tone={unreadCount > 0 ? "orange" : "emerald"}
          trend={unreadCount > 0 ? "Pending" : "Clear"}
          trendTone={unreadCount > 0 ? "warning" : "positive"}
        />
        <StatCard
          label="Logistics Milestones"
          value={orderEventsCount}
          sub="Orders and deliveries"
          tone="blue"
          trend="Logistics"
          trendTone="neutral"
        />
        <StatCard
          label="Today's Activity"
          value={todayCount}
          sub="Pushed today"
          tone="emerald"
          trend="Today"
          trendTone="positive"
        />
      </StatCard.Grid>

      <SectionCard
        noPadding
        icon={Bell}
        title="Notification Feed"
        subtitle={`${filtered.length} of ${notifications.length} events displayed — real-time alerts and activity pings from mobile users`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="h-[32px] px-3.5 bg-[#390955] text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
              >
                <CheckCheck size={13} aria-hidden="true" /> Mark {unreadCount} as seen
              </button>
            )}

            <Badge tone={unreadCount > 0 ? 'amber' : 'purple'}>
              {unreadCount > 0 ? `${unreadCount} Unread` : 'All Acknowledged'}
            </Badge>
          </div>
        }
        footer={
          <div className="px-6 py-3 border-t border-[#f0eaf8]">
            {filtered.length > 0 ? (
              <PaginationControls
                currentPage={currentPage}
                totalRecords={filtered.length}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[10, 15, 25, 50]}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={(n) => {
                  setRowsPerPage(n);
                  setCurrentPage(1);
                }}
              />
            ) : (
              <CardFooter resultsLabel="0 notifications" />
            )}
          </div>
        }
      >
        {/* Quick Segment Tabs Strip */}
        <div className="px-6 py-2.5 border-b border-[#f0eaf8] bg-[#faf8fc] flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Feed Segments:
          </span>
          {segmentTabs.map(tab => {
            const active = activeSegment === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveSegment(tab.id); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#390955] text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e8e0f0]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Standardized FilterBar */}
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search title, message, reference..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              width="w-64 sm:w-72"
            />

            <FilterBar.Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All</option>
              <option value="customer">Customer</option>
              <option value="seller">Seller</option>
              <option value="rider">Rider</option>
            </FilterBar.Select>

            <FilterBar.Select
              aria-label="Filter by notification type"
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Notification Types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </FilterBar.Select>

            <FilterBar.Select
              aria-label="Filter by time frame"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="week">Past 7 Days</option>
              <option value="month">Past 30 Days</option>
            </FilterBar.Select>

            <FilterBar.Count count={filtered.length} label="events" />
          </FilterBar.Group>

          <FilterBar.Actions>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                <X size={13} aria-hidden="true" /> Clear Filters
              </button>
            )}
            <ExportDropdown
              onExport={handleExport}
              disabled={filtered.length === 0}
            />
          </FilterBar.Actions>
        </FilterBar>

        {/* Feed List Container */}
        <div className="p-6">
          {loading ? (
            <ListSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            activeSegment === 'unread' && unreadCount === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All Caught Up"
                description="You have acknowledged all alerts. New events will appear here as they arrive from mobile users."
                action={
                  <button
                    onClick={() => setActiveSegment('all')}
                    className="h-[34px] px-4 bg-[#390955] text-white text-xs font-bold rounded-lg hover:brightness-110 cursor-pointer shadow-sm"
                  >
                    View All Notifications
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={Bell}
                title="No Notifications Found"
                description={
                  hasActiveFilters
                    ? 'No notifications match your current search and filter criteria. Try changing keywords or resetting filters.'
                    : 'Events appear here the moment the mobile app books, picks up, or delivers a parcel.'
                }
                action={
                  hasActiveFilters ? (
                    <button
                      onClick={handleClearFilters}
                      className="h-[34px] px-4 bg-[#390955] text-white text-xs font-bold rounded-lg hover:brightness-110 cursor-pointer shadow-sm"
                    >
                      Clear Filters
                    </button>
                  ) : null
                }
              />
            )
          ) : (
            <div className="flex flex-col gap-3">
              {pageRows.map(n => {
                const unread = !n.read && !readIds.includes(n._id);
                const roleConfig = ROLE_TONE[n.role] || ROLE_TONE.admin;
                const iconConfig = getNotificationIcon(n.type, n.role);
                const IconComp = iconConfig.icon;

                return (
                  <div
                    key={n._id}
                    className={`p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                      unread
                        ? 'bg-[#faf6fd] border-[#c4a8d8] shadow-xs border-l-4 border-l-[#f37021]'
                        : 'bg-white border-[#e0d5f0] hover:border-[#390955]/30'
                    }`}
                  >
                    {/* Category Icon Badge */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${iconConfig.bg}`}>
                      <IconComp size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge tone={roleConfig.tone}>{roleConfig.label}</Badge>
                        <strong className="text-xs font-bold text-slate-900">{n.title}</strong>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {TYPE_LABELS[n.type] || n.type}
                        </span>
                        {unread && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-100 text-[#f37021]">
                            New
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 leading-relaxed">{n.message}</div>

                      {n.relatedId && (
                        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-[#390955] bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                            Ref: {n.relatedId}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyRef(e, n.relatedId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-[#390955] bg-white border border-[#dcd3e8] hover:bg-[#f0eaf8] transition-colors cursor-pointer"
                            title="Copy reference ID"
                          >
                            {copiedId === n.relatedId ? (
                              <>
                                <Check size={10} className="text-emerald-600" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy size={10} /> Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Timestamp and Acknowledge Action */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[#390955]" title={formatDate(n.createdAt)}>
                          {formatRelativeTime(n.createdAt)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatDate(n.createdAt)}
                        </div>
                      </div>

                      {unread && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markOneRead(n._id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#390955] bg-white border border-[#390955]/30 hover:bg-[#390955] hover:text-white transition-all cursor-pointer shadow-2xs"
                          title="Mark this alert as acknowledged"
                        >
                          <Check size={11} /> Mark Seen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
