import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './services/api';
import useSSE from './services/useSSE';
import Modal from './components/ui/Modal';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import SectionCard from './components/ui/SectionCard';
import DataTable from './components/ui/DataTable';
import TableSkeleton from './components/ui/TableSkeleton';
import { useToast } from './components/ui/useToast';
import PaginationControls from './PaginationControls';
import FilterBar from './components/ui/FilterBar';
import EmptyState from './components/ui/EmptyState';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import {
  Eye, Search, ShieldAlert, X,
  Camera, Tag, User, Hash, Package, Activity, Calendar,
} from 'lucide-react';

const STATUS_TONE = {
  'Open': 'red',
  'Under Investigation': 'amber',
  'Resolved': 'green',
  'Closed': 'slate',
};

const CATEGORIES = [
  'All Categories',
  'Damaged Package',
  'Delayed Delivery',
  'Wrong Item Received',
  'Lost Package',
  'Rider Behavior',
  'Incorrect Address',
  'Billing / Payment Issue',
  'Other',
];

// Status filter options - rendered as a shared FilterBar.Select so this tab's
// control bar matches the Customers / Sellers / Riders / All Parcels tables.
const STATUS_OPTIONS = ['All', 'Open', 'Under Investigation', 'Resolved', 'Closed'];

const TABLE_HEADERS = [
  { label: 'Ticket ID',     icon: Hash },
  { label: 'Type',          icon: Tag },
  { label: 'Tracking ID',   icon: Package },
  { label: 'Reporter',      icon: User },
  { label: 'Status',        icon: Activity },
  { label: 'Date Reported', icon: Calendar },
  { label: 'Actions',       icon: null },
];

const ISSUE_EXPORT_COLUMNS = [
  { key: 'ticketId', label: 'Ticket ID' },
  { key: 'category', label: 'Issue Type' },
  { key: 'trackingNumber', label: 'Tracking ID' },
  { key: 'reporterName', label: 'Reporter Name' },
  { key: 'reporterContact', label: 'Reporter Contact' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Date Reported' },
];
// Triage columns only. Product name/category, ETA, and
// evidence-photo counts were removed from the grid — each still lives in the
// View & Resolve detail modal, so triage no longer needs side-to-side
// scrolling inside the page's max-width container.

export default function ManageIssues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('Open');
  const [zoomedImage, setZoomedImage] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const toast = useToast();

  const { lastEvent } = useSSE();

  // A failed/unreachable API is treated the same as "no tickets yet" — the
  // table renders its normal clean empty state rather than an error banner.
  const fetchIssues = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/issues');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setIssues(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Error fetching issues:', e);
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, []);

  // SSE real-time updates
  useEffect(() => {
    if (lastEvent) {
      if (lastEvent.type === 'issue-synced' || lastEvent.type === 'issue-status-updated') {
        fetchIssues();
      }
    }
  }, [lastEvent]);

  const showToast = (msg, type = 'success') => toast(msg, type === 'error' ? 'error' : 'success');

  const handleOpenDetail = (issue) => {
    setSelectedIssue(issue);
    setNewStatus(issue.status || 'Open');
    setAdminNotes(issue.adminNotes || '');
  };

  const handleUpdateStatus = async () => {
    if (!selectedIssue) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/issues/${selectedIssue._id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, adminNotes: adminNotes.trim() }),
      });

      if (!res.ok) throw new Error('Status update failed');
      const updated = await res.json();
      setIssues(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      setSelectedIssue(updated);
      showToast('Issue ticket updated and synchronized to mobile user.');
    } catch (err) {
      showToast(err.message || 'Error updating status', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const matchSearch =
        !search ||
        (issue.ticketId && issue.ticketId.toLowerCase().includes(search.toLowerCase())) ||
        (issue.trackingNumber && issue.trackingNumber.toLowerCase().includes(search.toLowerCase())) ||
        (issue.category && issue.category.toLowerCase().includes(search.toLowerCase())) ||
        (issue.reporterName && issue.reporterName.toLowerCase().includes(search.toLowerCase())) ||
        (issue.reporterEmail && issue.reporterEmail.toLowerCase().includes(search.toLowerCase())) ||
        (issue.productName && issue.productName.toLowerCase().includes(search.toLowerCase())) ||
        (issue.productCategory && issue.productCategory.toLowerCase().includes(search.toLowerCase())) ||
        (issue.description && issue.description.toLowerCase().includes(search.toLowerCase()));

      const matchStatus = statusFilter === 'All' || issue.status === statusFilter;
      const matchCategory = categoryFilter === 'All Categories' || issue.category === categoryFilter;

      return matchSearch && matchStatus && matchCategory;
    });
  }, [issues, search, statusFilter, categoryFilter]);

  const stats = useMemo(() => ({
    open: issues.filter(i => i.status === 'Open').length,
    investigating: issues.filter(i => i.status === 'Under Investigation').length,
    resolved: issues.filter(i => i.status === 'Resolved').length,
  }), [issues]);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, categoryFilter]);

  const indexOfLast = currentPage * rowsPerPage;
  const currentIssues = filteredIssues.slice(indexOfLast - rowsPerPage, indexOfLast);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const hasActiveFilters = !!search || categoryFilter !== 'All Categories' || statusFilter !== 'All';

  const handleClearFilters = () => {
    setSearch('');
    setCategoryFilter('All Categories');
    setStatusFilter('All');
    setCurrentPage(1);
  };

  const handleExport = (format) => {
    const exportData = filteredIssues.map(i => ({
      ...i,
      reporterContact: i.reporterEmail || i.reporterPhone || 'Mobile App',
      createdAt: formatDateTime(i.createdAt),
    }));
    const filename = `yto_issues_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'excel') {
      exportToExcel(exportData, ISSUE_EXPORT_COLUMNS, filename);
    } else if (format === 'word') {
      exportToWord(exportData, ISSUE_EXPORT_COLUMNS, filename, 'Customer Support & Issues Report');
    } else if (format === 'pdf') {
      exportToPDF(exportData, ISSUE_EXPORT_COLUMNS, filename, 'Customer Support & Issues Report');
    } else {
      exportToCSV(exportData, ISSUE_EXPORT_COLUMNS, filename);
    }
  };

  return (
    <div className="p-6 md:p-8 w-full">
    <div className="space-y-6">
      <PageHeader
        title="Customer Support & Issues"
        subtitle="Manage customer parcel issue reports, damaged goods disputes, and investigation tickets."
        breadcrumb={['Dashboard', 'Support', 'Issues']}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {lastUpdated && <span className="text-[11px] text-slate-400 font-mono">Updated {lastUpdated}</span>}
            <RefreshButton
              onClick={fetchIssues}
              isRefreshing={loading}
            />
          </div>
        }
      />

      {/* Main table card */}
      <SectionCard
        noPadding
        icon={ShieldAlert}
        title="Support Tickets"
        subtitle={`${filteredIssues.length} of ${issues.length} records — parcel issue reports and investigations`}
        className="w-full"
        footer={(
          <CardFooter
            resultsLabel={`Showing ${filteredIssues.length} of ${issues.length} results`}
            pills={[
              { label: 'Open', value: stats.open, tone: 'red' },
              { label: 'Investigating', value: stats.investigating, tone: 'amber' },
              { label: 'Resolved', value: stats.resolved, tone: 'green' },
            ]}
          />
        )}
      >
        {/* Control bar - shared FilterBar, same control set as the other ledgers */}
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              aria-label="Search tickets by ticket number, tracking number, or reporter"
              placeholder="Search ticket #, tracking #, reporter..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <FilterBar.Select
              aria-label="Filter by issue type"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat === 'All Categories' ? 'All' : cat}</option>)}
            </FilterBar.Select>
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map(st => <option key={st} value={st}>{st}</option>)}
            </FilterBar.Select>
            <FilterBar.Count count={filteredIssues.length} label="results" />
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
              disabled={filteredIssues.length === 0}
            />
          </FilterBar.Actions>
        </FilterBar>

        {/* Tickets Table */}
        <div style={{ padding: '8px 24px 24px' }}>
          <DataTable className="min-w-[1060px]" containerClassName="border border-[#e4d8f2] rounded-xl">
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
              ) : currentIssues.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} style={{ padding: '32px 16px' }}>
                    {issues.length === 0 ? (
                      <EmptyState
                        icon={ShieldAlert}
                        title="No issue tickets yet"
                        description="Tickets appear here when a customer reports a problem from the mobile app."
                      />
                    ) : (
                      <EmptyState
                        icon={Search}
                        title="No tickets match your search"
                        description="Try a different ticket number, tracking number, or reporter, then clear the type or status filter if needed."
                        action={
                          <button
                            onClick={handleClearFilters}
                            className="h-[34px] px-3.5 bg-[#390955] text-white text-xs font-bold rounded-lg hover:brightness-110 cursor-pointer shadow-sm"
                          >
                            Clear Filters
                          </button>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                currentIssues.map((issue, idx) => (
                  <DataTable.Row
                    key={issue._id || idx}
                    onClick={() => handleOpenDetail(issue)}
                  >
                    <DataTable.Cell stickyLeft className="font-mono text-xs font-bold text-brand-purple whitespace-nowrap">
                      {issue.ticketId}
                    </DataTable.Cell>
                    <DataTable.Cell className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                      {issue.category}
                    </DataTable.Cell>
                    <DataTable.Cell className="font-mono text-xs font-bold text-brand-orange whitespace-nowrap">
                      {issue.trackingNumber}
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap">
                      <div className="font-bold text-gray-800">{issue.reporterName || 'Customer'}</div>
                      <div className="text-[11px] text-gray-500">{issue.reporterEmail || issue.reporterPhone || 'Mobile App'}</div>
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap">
                      <Badge tone={STATUS_TONE[issue.status] || 'red'} hint={{ Open: 'Reported — awaiting first action', Investigating: 'Being investigated by operations staff', Resolved: 'Closed after a resolution was confirmed' }[issue.status]}>
                        {issue.status}
                      </Badge>
                    </DataTable.Cell>
                    <DataTable.Cell tabularNums className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(issue.createdAt)}
                    </DataTable.Cell>
                    <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(issue);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-brand-purple text-xs font-bold hover:bg-purple-50 transition opacity-80 group-hover:opacity-100 group-focus-within:opacity-100 whitespace-nowrap"
                      >
                        <Eye size={12} /> View Details
                      </button>
                    </DataTable.Cell>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable>

          {/* Pagination inside Card */}
          {!loading && filteredIssues.length > 0 && (
            <div className="pt-4">
              <PaginationControls
                currentPage={currentPage}
                totalRecords={filteredIssues.length}
                rowsPerPage={rowsPerPage}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
              />
            </div>
          )}
        </div>
      </SectionCard>
    </div>

      {/* Ticket Detail & Resolution Modal — outside the space-y-6 flow group
          (fixed, inset-0 overlays; sibling margin-top would offset them
          from the viewport edge). */}
      {selectedIssue && (
        <Modal
          tint="rgba(26,6,40,0.5)"
          blur={false}
          maxWidth={560}
          padding={0}
          onBackdropClick={() => !updating && setSelectedIssue(null)}
          cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}
        >
          <div className="flex items-start justify-between bg-gradient-to-br from-brand-purple to-[#5a1f80] px-6 py-5">
            <div>
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-white">
                <Hash size={15} className="text-white/70" /> Ticket Details — {selectedIssue.ticketId}
              </h3>
              <p className="mt-0.5 text-xs text-white/60">Filed {selectedIssue.createdAt ? new Date(selectedIssue.createdAt).toLocaleString() : 'N/A'}</p>
            </div>
            <button onClick={() => !updating && setSelectedIssue(null)} className="text-white/80 transition hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-6">
            <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="rounded-lg bg-brand-purple-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-muted"><Package size={12} /> TRACKING ID</div>
                <div className="mt-0.5 text-[15px] font-extrabold text-brand-orange">{selectedIssue.trackingNumber}</div>
              </div>
              <div className="rounded-lg bg-brand-purple-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-muted"><Tag size={12} /> ISSUE TYPE</div>
                <div className="mt-0.5 text-sm font-extrabold text-brand-purple">{selectedIssue.category}</div>
              </div>
            </div>

            {/* Shipment & Product Information */}
            <div className="mb-4 rounded-lg border border-brand-purple-200 bg-white p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-brand-purple"><Package size={13} /> Shipment Details</div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                <div><span className="text-gray-500">Product Name:</span> <strong>{selectedIssue.productName || '—'}</strong></div>
                <div><span className="text-gray-500">Product Category:</span> <strong>{selectedIssue.productCategory || '—'}</strong></div>
                <div><span className="text-gray-500">ETA:</span> <strong>{selectedIssue.eta || '—'}</strong></div>
              </div>
            </div>

            {/* Reporter Details */}
            <div className="mb-4 rounded-lg border border-brand-purple-200 bg-white p-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-purple"><User size={13} /> Reporter Information</div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div><span className="text-gray-500">Name:</span> <strong>{selectedIssue.reporterName || 'Customer'}</strong></div>
                <div><span className="text-gray-500">Role:</span> <strong className="capitalize">{selectedIssue.reporterRole || 'Customer'}</strong></div>
                <div><span className="text-gray-500">Email:</span> <strong>{selectedIssue.reporterEmail || 'N/A'}</strong></div>
                <div><span className="text-gray-500">Phone:</span> <strong>{selectedIssue.reporterPhone || 'N/A'}</strong></div>
              </div>
            </div>

            {/* Issue Description */}
            <div className="mb-4">
              <div className="mb-1 text-xs font-bold text-brand-purple">Report Description</div>
              <div className="whitespace-pre-wrap rounded-lg border border-brand-purple-200 bg-brand-purple-50/50 p-3 text-[13px] leading-relaxed text-gray-800">
                {selectedIssue.description || 'No detailed description provided.'}
              </div>
            </div>

            {/* Evidence Photos */}
            {selectedIssue.evidenceImages && selectedIssue.evidenceImages.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-purple">
                  <Camera size={13} /> Evidence Attachments ({selectedIssue.evidenceImages.length})
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {selectedIssue.evidenceImages.map((imgUri, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setZoomedImage(imgUri)}
                      className="h-20 w-20 overflow-hidden rounded-lg border-[1.5px] border-brand-purple-300 transition hover:opacity-80"
                    >
                      <img
                        src={imgUri}
                        alt={`Evidence ${idx + 1}`}
                        className="h-full w-full object-cover"
                        onError={(e) => { e.target.src = 'https://placehold.co/100x100?text=Photo'; }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution Control */}
            <div className="rounded-xl border-[1.5px] border-brand-purple-300 bg-brand-purple-50/30 p-4">
              <div className="mb-2.5 text-[13px] font-extrabold text-brand-purple">Update Investigation &amp; Resolution Status</div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-gray-600">STATUS</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    className="w-full rounded-md border-[1.5px] border-brand-purple-300 px-3 py-2 text-[13px] font-bold text-brand-purple outline-none focus:ring-2 focus:ring-[#f37021] focus:border-brand-purple"
                  >
                    <option value="Open">Open</option>
                    <option value="Under Investigation">Under Investigation</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-gray-600">ADMIN INVESTIGATION NOTES &amp; RESPONSE (Sent to Mobile User)</label>
                  <textarea
                    rows={3}
                    placeholder="Enter resolution notes, refund confirmation, or rider action taken..."
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    className="w-full resize-y rounded-md border-[1.5px] border-brand-purple-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#f37021] focus:border-brand-purple"
                  />
                </div>
              </div>

              <div className="mt-3.5 flex justify-end gap-2.5">
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="rounded-md border border-brand-purple-200 bg-white px-4 py-2 text-xs font-bold text-brand-purple transition hover:bg-brand-purple-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateStatus}
                  disabled={updating}
                  className="rounded-md bg-brand-orange px-5 py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updating ? 'Saving Status...' : 'Save & Notify User'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Zoom Evidence Modal */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-5"
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button onClick={() => setZoomedImage(null)} className="absolute -top-9 right-0 text-white transition hover:text-white/70">
              <X size={28} />
            </button>
            <img src={zoomedImage} alt="Evidence Zoom" className="max-h-[85vh] max-w-full rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
