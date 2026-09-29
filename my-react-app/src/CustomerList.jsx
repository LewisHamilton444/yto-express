import React, { useState, useEffect } from 'react';
import { apiFetch } from './services/api';
import useSSE from './services/useSSE';
import PaginationControls from './PaginationControls';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import ExportDropdown from './components/ui/ExportDropdown';
import RefreshButton from './components/ui/RefreshButton';
import Modal from './components/ui/Modal';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import SectionCard from './components/ui/SectionCard';
import DataTable from './components/ui/DataTable';
import FilterBar from './components/ui/FilterBar';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import './LedgerPage.css';
import { LEDGER_MODAL_CARD, LEDGER_MODAL_OVERLAY, LEDGER_MODAL_TINT, initialsOf } from './ledger';
import LedgerStatus from './components/ui/LedgerStatus';
import {
  Users, Search, X,
  Hash, User, Mail, Phone, Activity, Globe, Calendar,
  PackageSearch, History, Info, Eye,
} from 'lucide-react';

const CUSTOMER_EXPORT_COLUMNS = [
  { key: 'customerId', label: 'Customer ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'address', label: 'Primary Address' },
  { key: 'city', label: 'City' },
  { key: 'deliveryInstructions', label: 'Delivery Instructions' },
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

const KNOWN_PH_CITIES = [
  'Pulilan', 'Malolos', 'Baliuag', 'Baliwag', 'Calumpit', 'Plaridel',
  'Guiguinto', 'Bocaue', 'Meycauayan', 'Marilao', 'San Jose del Monte',
  'Santa Maria', 'Angat', 'Norzagaray', 'San Ildefonso', 'San Miguel',
  'San Rafael', 'Pandi', 'Paombong', 'Hagonoy', 'Bulakan', 'Balagtas',
  'Obando', 'Bustos', 'Doña Remedios Trinidad', 'Quezon City', 'Manila',
  'Caloocan', 'Pasig', 'Taguig', 'Valenzuela', 'Makati', 'Pasay', 'Mandaluyong'
];

function resolveCustomerCity(customer) {
  if (customer?.city && customer.city.trim()) return customer.city.trim();
  const address = customer?.address || customer?.deliveryInstructions || '';
  if (!address) return '';
  for (const city of KNOWN_PH_CITIES) {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(address)) {
      return city;
    }
  }
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts[parts.length - 2];
  }
  return '';
}

const TABLE_HEADERS = [
  { label: 'Customer ID', icon: Hash },
  { label: 'Full Name', icon: User },
  { label: 'Email Address', icon: Mail },
  { label: 'Phone Number', icon: Phone },
  { label: 'Status', icon: Activity },
  { label: 'Source', icon: Globe },
  { label: 'Joined', icon: Calendar },
  { label: 'Actions', icon: Eye },
];

const DETAIL_TABS = [
  { key: 'details', label: 'Details', icon: Info },
  { key: 'orders', label: 'Orders', icon: PackageSearch },
  { key: 'timeline', label: 'Timeline', icon: History },
];

const CustomerList = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailTab, setDetailTab] = useState('details');
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const { on: onSSE } = useSSE();

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!onSSE) return;
    const unsub = onSSE('user-synced', (data) => {
      if (!data || data.role === 'customer') {
        fetchCustomers();
      }
    });
    return () => { if (unsub) unsub(); };
  }, [onSSE]);

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
  const fetchCustomers = async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      else setLoading(true);
      const res = await apiFetch('/customers');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching customers:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
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
        title: 'Account Registered',                        description: `${customer.fullName} joined as a customer`,
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
              description: `Parcel "${parcel.item}" from ${parcel.senderName || '—'}`,
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
    const matchStatus = statusFilter === 'All' || (c.status || 'Active') === statusFilter;
    return matchSearch && matchStatus;
  });

  const maxPage = Math.max(1, Math.ceil(filtered.length / recordsPerPage));
  const safePage = Math.min(currentPage, maxPage);
  const indexOfLast = safePage * recordsPerPage;
  const indexOfFirst = indexOfLast - recordsPerPage;
  const currentRecords = filtered.slice(indexOfFirst, indexOfLast);

  const handleExport = (format) => {
    const exportData = filtered.map(c => ({
      ...c,
      city: resolveCustomerCity(c) || '-',
    }));
    if (format === 'excel') {
      exportToExcel(exportData, CUSTOMER_EXPORT_COLUMNS, 'yto_customers');
    } else if (format === 'word') {
      exportToWord(exportData, CUSTOMER_EXPORT_COLUMNS, 'yto_customers', 'Customer Directory Report');
    } else if (format === 'pdf') {
      exportToPDF(exportData, CUSTOMER_EXPORT_COLUMNS, 'yto_customers', 'Customer Directory Report');
    } else {
      exportToCSV(exportData, CUSTOMER_EXPORT_COLUMNS, 'yto_customers');
    }
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

  const activeCount = customers.filter(c => c.status !== 'Deactivated').length;

  return (
    <div className="lp-page">
      <PageHeader
        className="lp-header"
        title="Customer List"
        subtitle="Customers registered through the mobile app"
        breadcrumb={['Dashboard', 'People', 'Customer List']}
        actions={(
          <RefreshButton
            onClick={() => fetchCustomers(true)}
            isRefreshing={isRefreshing}
            disabled={loading}
          />
        )}
      />

      {/* Main table card — fills the rest of the screen. Only the table body
          scrolls (header row pinned); pagination is docked in the footer. */}
      <SectionCard
        noPadding
        className="lp-card"
        bodyClassName="lp-card-body"
        footer={!loading && filtered.length > 0 ? (
          <div className="lp-footer">
            <PaginationControls
              currentPage={safePage}
              totalRecords={filtered.length}
              rowsPerPage={recordsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(n) => { setRecordsPerPage(n); setCurrentPage(1); }}
            />
          </div>
        ) : null}
      >
        {/* Control bar */}
        <FilterBar className="lp-toolbar">
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search by name, email, or ID..."
              aria-label="Search customers"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All</option>
              <option value="Active" className="font-medium text-slate-700 bg-white">Active</option>
              <option value="Inactive" className="font-medium text-slate-700 bg-white">Inactive</option>
            </FilterBar.Select>
            <span className="lp-count">
              <strong>{filtered.length}</strong> of {customers.length} customers
              <span className="lp-count-active">{activeCount} active</span>
            </span>
          </FilterBar.Group>
          <FilterBar.Actions>
            <ExportDropdown onExport={handleExport} disabled={filtered.length === 0} className="lp-export" />
          </FilterBar.Actions>
        </FilterBar>

        {/* Table */}
        <DataTable className="lp-table" containerClassName="lp-table-scroll">
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
                    <span className="flex items-center gap-1.5"><h.icon size={12} className="lp-th-icon" aria-hidden="true" />{h.label}</span>
                  )}
                </DataTable.Th>
              ))}
            </tr>
          </DataTable.Head>
          <tbody>
            {loading ? (
              <TableSkeleton rows={6} columns={TABLE_HEADERS.length} />
            ) : currentRecords.length === 0 ? (
              <tr>
                <td colSpan={TABLE_HEADERS.length} style={{ padding: '32px 16px' }}>
                  {customers.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No customer records yet"
                      description="Customer accounts appear here as they sign up or sync from the mobile app."
                    />
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="No customer records match your search"
                      description="Try a different name, email, or ID, then clear the status filter if needed."
                    />
                  )}
                </td>
              </tr>
            ) : currentRecords.map((c, i) => (
              <DataTable.Row
                key={c._id || i}
                onClick={() => { setDetailCustomer(c); setDetailTab('details'); setOrders([]); setTimelineEvents([]); }}
              >
                <DataTable.Cell stickyLeft className="lp-id whitespace-nowrap">{c.customerId || '-'}</DataTable.Cell>
                <DataTable.Cell className="whitespace-nowrap">
                  <span className="lp-name">
                    <span className="lp-avatar" aria-hidden="true">{initialsOf(c.fullName)}</span>
                    <span className="lp-name-text">{c.fullName || '-'}</span>
                  </span>
                </DataTable.Cell>
                <DataTable.Cell className="lp-muted lp-email whitespace-nowrap" title={c.email || undefined}>{c.email || '-'}</DataTable.Cell>
                <DataTable.Cell tabularNums className="lp-muted whitespace-nowrap">{c.phone || '-'}</DataTable.Cell>
                <DataTable.Cell className="whitespace-nowrap"><StatusPill status={c.status || 'Active'} /></DataTable.Cell>
                <DataTable.Cell className="lp-muted whitespace-nowrap">{formatSource(c.source)}</DataTable.Cell>
                <DataTable.Cell tabularNums className="lp-muted whitespace-nowrap">{formatDate(c.createdAt)}</DataTable.Cell>
                <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailCustomer(c);
                      setDetailTab('details');
                      setOrders([]);
                      setTimelineEvents([]);
                    }}
                    className="lp-view-btn"
                  >
                    <Eye size={13} aria-hidden="true" /> View Details
                  </button>
                </DataTable.Cell>
              </DataTable.Row>
            ))}
          </tbody>
        </DataTable>
      </SectionCard>

      {/* Detail Modal — a fixed, inset-0 overlay, so it sits outside the
          page's flex layout and is unaffected by the no-scroll frame. */}
      {detailCustomer && (
        <Modal tint={LEDGER_MODAL_TINT} blur={false} overlayStyle={LEDGER_MODAL_OVERLAY} maxWidth={560} padding={0} label="Customer details" onBackdropClick={() => setDetailCustomer(null)} cardStyle={LEDGER_MODAL_CARD}>
          {/* Header — identity at a glance: initials, name, ID, status */}
          <div className="lp-modal-head">
            <span className="lp-modal-avatar" aria-hidden="true">{initialsOf(detailCustomer.fullName)}</span>
            <div className="lp-modal-identity">
              <h3 id="lp-modal-title">{detailCustomer.fullName || 'Customer'}</h3>
              <div className="lp-modal-meta">
                <span className="lp-modal-id">{detailCustomer.customerId || 'No ID yet'}</span>
                <StatusPill status={detailCustomer.status || 'Active'} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetailCustomer(null)}
              className="lp-modal-close"
              aria-label="Close customer details"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Tabs — segmented control */}
          <div className="lp-modal-tabs" role="tablist" aria-label="Customer details sections">
            {DETAIL_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.key}
                onClick={() => setDetailTab(tab.key)}
                className={`lp-modal-tab${detailTab === tab.key ? ' is-active' : ''}`}
              >
                <tab.icon size={14} aria-hidden="true" /> {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="lp-modal-body" role="tabpanel">
            {/* ── Details Tab ── grouped into Contact / Address / Account */}
            {detailTab === 'details' && (
              <div className="lp-detail-groups">
                {[
                  {
                    title: 'Contact',
                    rows: [
                      { label: 'Email Address', value: detailCustomer.email, wrap: true },
                      { label: 'Phone Number', value: detailCustomer.phone },
                    ],
                  },
                  {
                    title: 'Address',
                    rows: [
                      { label: 'Primary Address', value: detailCustomer.address, wrap: true },
                      { label: 'City', value: resolveCustomerCity(detailCustomer) },
                      { label: 'Delivery Instructions', value: detailCustomer.deliveryInstructions, wrap: true },
                    ],
                  },
                  {
                    title: 'Account',
                    rows: [
                      { label: 'Role', node: <Badge tone="purple" uppercase={false}>{formatSource(detailCustomer.role || 'customer')}</Badge> },
                      { label: 'Status', node: <StatusPill status={detailCustomer.status || 'Active'} /> },
                      { label: 'Source', value: formatSource(detailCustomer.source) },
                      { label: 'Joined', value: detailCustomer.createdAt ? formatDateTime(detailCustomer.createdAt) : '' },
                      { label: 'Last Updated', value: detailCustomer.updatedAt ? formatDateTime(detailCustomer.updatedAt) : '' },
                    ],
                  },
                ].map(group => (
                  <section key={group.title} className="lp-detail-group" aria-label={group.title}>
                    <h4>{group.title}</h4>
                    <dl>
                      {group.rows.map(row => {
                        const empty = !row.node && !(row.value && String(row.value).trim());
                        return (
                          <div key={row.label} className="lp-detail-row">
                            <dt>{row.label}</dt>
                            <dd className={`${row.wrap ? 'is-wrap' : ''}${empty ? ' is-empty' : ''}`}>
                              {row.node || (empty ? 'Not provided' : row.value)}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
              </div>
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

// "mobile-app" → "Mobile app": the stored source key, in plain language.
function formatSource(source) {
  const raw = (source || 'mobile-app').replace(/[-_]+/g, ' ').trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Customer status → shared ledger pill (table rows and the detail modal).
function StatusPill({ status }) {
  return <LedgerStatus tone={STATUS_TONE[status] === 'red' ? 'off' : 'on'}>{status}</LedgerStatus>;
}

export default CustomerList;
