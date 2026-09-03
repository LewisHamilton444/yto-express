'use client';
import React, { useState, useEffect } from 'react';
import { apiFetch } from './services/localApi';
import PaginationControls from './PaginationControls';
import { exportToCSV } from './exportUtils';
import Modal from './components/ui/Modal';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import { ACCOUNT_CATEGORY_TONE, ACCOUNT_CATEGORY_LABEL } from './components/ui/statusColors';
import {
  Users, Search, X,
  Hash, User, Mail, Phone, Tag, Activity, Globe, Calendar,
  PackageSearch, History, Info,
} from 'lucide-react';

const CUSTOMER_EXPORT_COLUMNS = [
  { key: 'customerId', label: 'Customer ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'accountCategory', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
];

const STATUS_TONE = { Active: 'green', Inactive: 'red' };
const PARCEL_STATUS_TONE = {
  'Pending': 'slate', 'In Transit': 'blue', 'Delivered': 'green', 'Cancelled': 'red', 'Returned': 'amber',
};

const TIMELINE = {
  registration: { dot: 'bg-brand-purple', accent: '#390955' },
  order:        { dot: 'bg-brand-orange', accent: '#f37021' },
  status:       { dot: 'bg-blue-600',     accent: '#2563eb' },
};

const TABLE_HEADERS = [
  { label: 'Customer ID', icon: Hash },
  { label: 'Name', icon: User },
  { label: 'Email', icon: Mail },
  { label: 'Phone', icon: Phone },
  { label: 'Category', icon: Tag },
  { label: 'Status', icon: Activity },
  { label: 'Source', icon: Globe },
  { label: 'Joined', icon: Calendar },
];

const DETAIL_TABS = [
  { key: 'details', label: 'Details', icon: Info },
  { key: 'orders', label: 'Orders', icon: PackageSearch },
  { key: 'timeline', label: 'Timeline', icon: History },
];

const CustomerList = ({ currentUser }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(currentUser?.isDemo ? 'DEMO' : 'REAL');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailTab, setDetailTab] = useState('details');
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (detailCustomer && detailTab === 'orders') {
      fetchOrders(detailCustomer.customerId);
    }
    if (detailCustomer && detailTab === 'timeline') {
      buildTimeline(detailCustomer);
    }
  }, [detailCustomer, detailTab]);

  // A failed/unreachable API is treated the same as "no records yet" — the
  // table renders its normal clean empty state rather than an error banner.
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/customers');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching customers:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async (customerId) => {
    try {
      setOrdersLoading(true);
      const res = await apiFetch(`/customers/${customerId}/orders`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const buildTimeline = async (customer) => {
    try {
      setTimelineLoading(true);
      const events = [];

      events.push({
        type: 'registration',
        title: 'Account Registered',
        description: `${customer.fullName} joined as a ${customer.accountCategory || 'REAL'} account`,
        timestamp: customer.createdAt,
      });

      if (customer.statusHistory && customer.statusHistory.length > 0) {
        customer.statusHistory.forEach(sh => {
          events.push({
            type: 'status',
            title: `Status: ${sh.status}`,
            description: sh.reason || 'Status changed',
            timestamp: sh.changedAt,
          });
        });
      }

      try {
        const res = await apiFetch(`/customers/${customer.customerId}/orders`);
        if (res.ok) {
          const parcelsRaw = await res.json();
          const parcels = Array.isArray(parcelsRaw) ? parcelsRaw : [];
          parcels.forEach(parcel => {
            events.push({
              type: 'order',
              title: `Order Created: ${parcel.trackingNumber}`,
              description: `Parcel "${parcel.item}" from ${parcel.senderName || 'Unknown'}`,
              timestamp: parcel.createdAt,
            });

            if (parcel.events && parcel.events.length > 0) {
              parcel.events.forEach(evt => {
                events.push({
                  type: 'status',
                  title: `${parcel.trackingNumber}: ${evt.status || evt.event}`,
                  description: evt.event || 'Status updated',
                  timestamp: evt.time,
                });
              });
            }
          });
        }
      } catch {
        // Order events are a nice-to-have addition to the timeline — if
        // they fail to load, the registration/status events above still render.
      }

      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setTimelineEvents(events);
    } catch (err) {
      console.error('Error building timeline:', err);
      setTimelineEvents([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const filtered = customers.filter(c => {
    const matchSearch = c.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.customerId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = categoryFilter === 'All' || c.accountCategory === categoryFilter;
    return matchSearch && matchCategory;
  });

  const indexOfLast = currentPage * recordsPerPage;
  const indexOfFirst = indexOfLast - recordsPerPage;
  const currentRecords = filtered.slice(indexOfFirst, indexOfLast);

  const realCount = customers.filter(c => c.accountCategory !== 'DEMO').length;
  const demoCount = customers.filter(c => c.accountCategory === 'DEMO').length;

  const handleExport = () => {
    exportToCSV(filtered, CUSTOMER_EXPORT_COLUMNS, 'yto_customers');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
    <div className="space-y-6">
      <PageHeader
        title="Customer List"
        subtitle="Mobile-registered customers synced via bridge"
        breadcrumb={['Dashboard', 'Customer Management', 'Customer List']}
      />

      {/* Main table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <CardSectionHeader
          icon={Users}
          title="Customer List"
          subtitle={`${filtered.length} of ${customers.length} records — mobile-registered accounts and status`}
        />

        {/* Control bar */}
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 w-72"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white cursor-pointer font-semibold text-brand-purple"
            >
              <option value="All">All Categories</option>
              <option value="REAL">Real</option>
              <option value="DEMO">Demo</option>
            </select>
            <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} results</span>
          </div>
          <button
            onClick={handleExport}
            className="mp-export-btn"
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px',
              borderRadius: 8, border: 'none', background: '#f37021', color: 'white',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="13" height="13">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="bg-[#390955] text-white">
              <tr>
                {TABLE_HEADERS.map(h => (
                  <th key={h.label} className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-left">
                    <span className="flex items-center gap-1.5"><h.icon size={12} />{h.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={6} columns={TABLE_HEADERS.length} />
              ) : currentRecords.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="py-12 text-sm text-center text-slate-400">
                    {customers.length === 0 && !currentUser?.isDemo
                      ? 'No active production records found.'
                      : 'No records found in this category.'}
                  </td>
                </tr>
              ) : currentRecords.map((c, i) => (
                <tr
                  key={c._id || i}
                  onClick={() => { setDetailCustomer(c); setDetailTab('details'); setOrders([]); setTimelineEvents([]); }}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold text-brand-purple">{c.customerId || '-'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{c.fullName || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.email || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.phone || '-'}</td>
                  <td className="px-4 py-3"><Badge tone={ACCOUNT_CATEGORY_TONE[c.accountCategory] || 'slate'}>{ACCOUNT_CATEGORY_LABEL[c.accountCategory] || c.accountCategory || 'Real (Verified)'}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[c.status] || 'green'}>{c.status || 'Active'}</Badge></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.source || 'mobile-app'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CardFooter
          resultsLabel={`Showing ${filtered.length} of ${customers.length} results`}
          pills={[
            { label: 'Real', value: realCount, tone: 'green' },
            { label: 'Demo', value: demoCount, tone: 'amber' },
          ]}
        />
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalRecords={filtered.length}
          rowsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={(n) => { setRecordsPerPage(n); setCurrentPage(1); }}
        />
      )}
    </div>

      {/* Detail Modal — outside the space-y-6 flow group: it's a fixed,
          inset-0 overlay, and space-y's sibling margin-top would otherwise
          push it down away from the viewport edge. */}
      {detailCustomer && (
        <Modal tint="rgba(26,6,40,0.5)" blur={false} maxWidth={520} padding={0} onBackdropClick={() => setDetailCustomer(null)} cardStyle={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
          {/* Header */}
          <div className="flex items-start justify-between bg-gradient-to-br from-brand-purple to-[#5a1f80] px-6 py-5">
            <div>
              <h3 className="text-[15px] font-bold text-white">{detailCustomer.fullName || 'Customer'}</h3>
              <p className="mt-0.5 text-xs text-white/60">{detailCustomer.customerId}</p>
            </div>
            <button onClick={() => setDetailCustomer(null)} className="text-white/80 transition hover:text-white">
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b-2 border-brand-purple-100">
            {DETAIL_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setDetailTab(tab.key)}
                className={`-mb-0.5 flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[13px] font-semibold transition ${
                  detailTab === tab.key
                    ? 'border-brand-purple bg-brand-purple-50 text-brand-purple'
                    : 'border-transparent text-brand-muted hover:bg-brand-purple-50/60'
                }`}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="max-h-[420px] overflow-y-auto p-6">
            {/* ── Details Tab ── */}
            {detailTab === 'details' && (
              <>
                {[
                  { label: 'Full Name', value: detailCustomer.fullName },
                  { label: 'Email', value: detailCustomer.email },
                  { label: 'Phone', value: detailCustomer.phone || '---' },
                  { label: 'Account Category', value: ACCOUNT_CATEGORY_LABEL[detailCustomer.accountCategory] || detailCustomer.accountCategory || 'Real (Verified)', badge: true, tone: ACCOUNT_CATEGORY_TONE[detailCustomer.accountCategory] || 'green' },
                  { label: 'Status', value: detailCustomer.status || 'Active', badge: true, tone: STATUS_TONE[detailCustomer.status] || 'green' },
                  { label: 'Source', value: detailCustomer.source || 'mobile-app' },
                  { label: 'Joined', value: formatDateTime(detailCustomer.createdAt) },
                  { label: 'Last Updated', value: formatDateTime(detailCustomer.updatedAt) },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between border-b border-brand-purple-100 py-2.5">
                    <span className="text-xs font-semibold text-brand-muted">{row.label}</span>
                    {row.badge ? <Badge tone={row.tone}>{row.value}</Badge> : <span className="text-sm font-medium text-gray-900">{row.value}</span>}
                  </div>
                ))}
              </>
            )}

            {/* ── Orders Tab ── */}
            {detailTab === 'orders' && (
              <>
                {ordersLoading ? (
                  <ListSkeletonInline rows={3} />
                ) : orders.length === 0 ? (
                  <EmptyState
                    icon={PackageSearch}
                    title="No orders found for this customer"
                    description="Orders appear here after parcels are synced from the mobile app."
                  />
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {orders.map((order, idx) => (
                      <div key={order._id || idx} className="rounded-lg border border-brand-purple-100 bg-brand-purple-50 px-4 py-3.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-brand-purple">{order.trackingNumber}</span>
                          <Badge tone={PARCEL_STATUS_TONE[order.status] || 'slate'}>{order.status || 'Pending'}</Badge>
                        </div>
                        <div className="mb-1 text-xs text-gray-500"><strong className="text-gray-900">Item:</strong> {order.item || '-'}</div>
                        <div className="mb-1 text-xs text-gray-500"><strong className="text-gray-900">From:</strong> {order.senderName || '-'}</div>
                        <div className="mb-1 text-xs text-gray-500"><strong className="text-gray-900">To:</strong> {order.destination || '-'}</div>
                        <div className="text-[11px] text-brand-muted-2">{formatDateTime(order.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Timeline Tab ── */}
            {detailTab === 'timeline' && (
              <>
                {timelineLoading ? (
                  <ListSkeletonInline rows={4} />
                ) : timelineEvents.length === 0 ? (
                  <EmptyState icon={History} title="No activity yet" />
                ) : (
                  <div className="relative pl-7">
                    <div className="absolute bottom-1.5 left-[11px] top-1.5 w-0.5 rounded-full bg-gradient-to-b from-brand-purple via-blue-600 to-brand-orange opacity-30" />
                    {timelineEvents.map((evt, idx) => {
                      const t = TIMELINE[evt.type] || TIMELINE.status;
                      return (
                        <div key={idx} className={idx < timelineEvents.length - 1 ? 'relative mb-5' : 'relative'}>
                          <div className={`absolute -left-7 top-0.5 z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-4 ring-white ${t.dot}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>
                          <div
                            className="rounded-lg border border-brand-purple-100 bg-brand-purple-50 px-3.5 py-2.5"
                            style={{ borderLeftWidth: 3, borderLeftColor: t.accent }}
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-900">{evt.title}</span>
                              <span className="ml-2 whitespace-nowrap text-[10px] text-brand-muted-2">{formatTimeAgo(evt.timestamp)}</span>
                            </div>
                            <p className="m-0 text-[11px] leading-relaxed text-gray-500">{evt.description}</p>
                            <p className="m-0 mt-1 text-[10px] text-brand-purple-300">{formatDateTime(evt.timestamp)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

// Small inline skeleton for the two modal tabs (orders/timeline) — same
// shimmer language as TableSkeleton, sized for the modal's narrower column.
function ListSkeletonInline({ rows }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-brand-purple-50" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

export default CustomerList;
