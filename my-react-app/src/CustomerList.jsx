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
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import SectionCard from './components/ui/SectionCard';
import DataTable from './components/ui/DataTable';
import FilterBar from './components/ui/FilterBar';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import {
  Users, Search, X,
  Hash, User, Mail, Phone, Activity, Globe, Calendar,
  PackageSearch, History, Info, Shield, Eye,
} from 'lucide-react';

const CUSTOMER_EXPORT_COLUMNS = [
  { key: 'customerId', label: 'Customer ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'address', label: 'Primary Address' },
  { key: 'city', label: 'City' },
  { key: 'deliveryInstructions', label: 'Delivery Instructions' },
  { key: 'role', label: 'Role' },
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
  { label: 'Role', icon: Shield },
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
      role: c.role || 'Customer',
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

  return (
    <div className="p-6 md:p-8 w-full">
      <div className="space-y-6">
      <PageHeader
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

      {/* Main table card */}
      <SectionCard
        noPadding
        footer={(
          <CardFooter
            resultsLabel={`Showing ${filtered.length} of ${customers.length} results`}
            pills={[
              { label: 'Active', value: customers.filter(c => c.status !== 'Deactivated').length, tone: 'green' },
            ]}
          />
        )}
      >
        <CardSectionHeader
          icon={Users}
          title="Customer List"
          subtitle={`${filtered.length} of ${customers.length} records — mobile-registered accounts and status`}
        />

        {/* Control bar */}
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search by name, email, or ID..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="All" className="font-medium text-slate-700 bg-white">All Statuses</option>
              <option value="Active" className="font-medium text-slate-700 bg-white">Active</option>
              <option value="Inactive" className="font-medium text-slate-700 bg-white">Inactive</option>
            </FilterBar.Select>
            <FilterBar.Count count={filtered.length} label="results" />
          </FilterBar.Group>
          <FilterBar.Actions>
            <ExportDropdown onExport={handleExport} disabled={filtered.length === 0} />
          </FilterBar.Actions>
        </FilterBar>

        {/* Table */}
        <div style={{ padding: '8px 24px 24px' }}>
          <DataTable className="min-w-[1160px]" containerClassName="border border-[#e4d8f2] rounded-xl">
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
                      <span className="flex items-center gap-1.5"><h.icon size={12} className="text-slate-400" />{h.label}</span>
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
                  <DataTable.Cell stickyLeft className="font-mono text-xs font-bold text-brand-purple whitespace-nowrap">{c.customerId || '-'}</DataTable.Cell>
                  <DataTable.Cell className="text-sm font-semibold text-gray-900 whitespace-nowrap">{c.fullName || '-'}</DataTable.Cell>
                  <DataTable.Cell className="text-xs text-gray-500 whitespace-nowrap">{c.email || '-'}</DataTable.Cell>
                  <DataTable.Cell className="text-xs text-gray-500 whitespace-nowrap">{c.phone || '-'}</DataTable.Cell>
                  <DataTable.Cell className="whitespace-nowrap">
                    <Badge tone="purple">{c.role || 'Customer'}</Badge>
                  </DataTable.Cell>
                  <DataTable.Cell className="whitespace-nowrap"><Badge tone={STATUS_TONE[c.status] || 'green'}>{c.status || 'Active'}</Badge></DataTable.Cell>
                  <DataTable.Cell className="text-xs text-gray-500 whitespace-nowrap">{c.source || 'mobile-app'}</DataTable.Cell>
                  <DataTable.Cell tabularNums className="text-xs text-gray-500 whitespace-nowrap">{formatDate(c.createdAt)}</DataTable.Cell>
                  <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailCustomer(c);
                        setDetailTab('details');
                        setOrders([]);
                        setTimelineEvents([]);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-brand-purple text-xs font-bold hover:bg-purple-50 transition opacity-80 group-hover:opacity-100 group-focus-within:opacity-100 whitespace-nowrap"
                    >
                      <Eye size={12} /> View Details
                    </button>
                  </DataTable.Cell>
                </DataTable.Row>
              ))}
            </tbody>
          </DataTable>
        </div>
      </SectionCard>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <PaginationControls
          currentPage={safePage}
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
        <Modal tint="rgba(26,6,40,0.5)" blur={false} maxWidth={520} padding={0} onBackdropClick={() => setDetailCustomer(null)} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
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
                  { label: 'Role', value: detailCustomer.role || 'Customer', badge: true, tone: 'purple' },
                  { label: 'Email Address', value: detailCustomer.email },
                  { label: 'Phone Number', value: detailCustomer.phone || '---' },
                  { label: 'Primary Address', value: detailCustomer.address || '—' },
                  { label: 'City', value: resolveCustomerCity(detailCustomer) || '—' },
                  { label: 'Delivery Instructions', value: detailCustomer.deliveryInstructions || '—' },
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
