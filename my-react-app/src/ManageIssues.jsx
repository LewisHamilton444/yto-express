'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from './services/localApi';
import useSSE from './services/useSSE';
import Modal from './components/ui/Modal';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import TableSkeleton from './components/ui/TableSkeleton';
import { useToast } from './components/ui/ToastContext';
import { ACCOUNT_CATEGORY_TONE, ACCOUNT_CATEGORY_LABEL } from './components/ui/statusColors';
import PaginationControls from './PaginationControls';
import { isDemoEmail } from './demoUtils';
import {
  Eye, Search, ShieldAlert, X,
  Camera, Tag, User, Hash, Package,
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
  'Courier Behavior',
  'Incorrect Address',
  'Billing / Payment Issue',
  'Other',
];

const STATUS_TABS = ['All', 'Open', 'Under Investigation', 'Resolved', 'Closed'];

const TABLE_HEADERS = ['Ticket ID', 'Type', 'Tracking #', 'Category', 'Reporter', 'Status', 'Evidence', 'Date Reported'];

export default function ManageIssues({ currentUser }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [accountCategoryFilter, setAccountCategoryFilter] = useState(currentUser?.isDemo ? 'DEMO' : 'REAL');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('Open');
  const [zoomedImage, setZoomedImage] = useState(null);
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
        (issue.reporterName && issue.reporterName.toLowerCase().includes(search.toLowerCase())) ||
        (issue.reporterEmail && issue.reporterEmail.toLowerCase().includes(search.toLowerCase())) ||
        (issue.description && issue.description.toLowerCase().includes(search.toLowerCase()));

      const matchStatus = statusFilter === 'All' || issue.status === statusFilter;
      const matchCategory = categoryFilter === 'All Categories' || issue.category === categoryFilter;
      const cat = issue.accountCategory || (isDemoEmail(issue.reporterEmail) ? 'DEMO' : 'REAL');
      const matchAccountCategory = accountCategoryFilter === 'All' || cat === accountCategoryFilter;

      return matchSearch && matchStatus && matchCategory && matchAccountCategory;
    });
  }, [issues, search, statusFilter, categoryFilter, accountCategoryFilter]);

  const stats = useMemo(() => ({
    open: issues.filter(i => i.status === 'Open').length,
    investigating: issues.filter(i => i.status === 'Under Investigation').length,
    resolved: issues.filter(i => i.status === 'Resolved').length,
  }), [issues]);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, categoryFilter, accountCategoryFilter]);

  const indexOfLast = currentPage * rowsPerPage;
  const currentIssues = filteredIssues.slice(indexOfLast - rowsPerPage, indexOfLast);

  return (
    <div className="p-8 max-w-7xl mx-auto">
    <div className="space-y-6">
      <PageHeader
        title="Customer Support & Issues"
        subtitle="Manage customer parcel issue reports, damaged goods disputes, and investigation tickets."
        breadcrumb={['Dashboard', 'Customer Management', 'Customer Issues']}
      />


      {/* Main table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <CardSectionHeader
          icon={ShieldAlert}
          title="Support Tickets"
          subtitle={`${filteredIssues.length} of ${issues.length} records — parcel issue reports and investigations`}
        />

        {/* Control bar */}
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket #, tracking #, reporter..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 w-72"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white cursor-pointer font-semibold text-brand-purple"
            >
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <select
              value={accountCategoryFilter}
              onChange={e => setAccountCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white cursor-pointer font-semibold text-brand-purple"
            >
              <option value="All">All Types</option>
              <option value="REAL">Real User Reports</option>
              <option value="DEMO">Demo Reports</option>
            </select>

            {/* Status filter tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_TABS.map(st => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px',
                      borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
                      background: active ? '#390955' : '#f1f5f9',
                      color: active ? '#ffffff' : '#475569',
                    }}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            <span className="text-xs text-slate-400 whitespace-nowrap">{filteredIssues.length} results</span>
          </div>
        </div>

        {/* Tickets Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="bg-[#390955] text-white">
              <tr>
                {TABLE_HEADERS.map(h => <th key={h} className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-left">{h}</th>)}
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={6} columns={TABLE_HEADERS.length + 1} />
              ) : currentIssues.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_HEADERS.length + 1} className="py-12 text-sm text-center text-slate-400">
                    {issues.length === 0 && !currentUser?.isDemo
                      ? 'No active production records found.'
                      : 'No records found in this category.'}
                  </td>
                </tr>
              ) : (
                currentIssues.map((issue, idx) => {
                  const isDemo = issue.accountCategory === 'DEMO' || isDemoEmail(issue.reporterEmail);
                  const catKey = isDemo ? 'DEMO' : 'REAL';
                  const dateStr = issue.createdAt ? new Date(issue.createdAt).toLocaleString() : 'N/A';
                  return (
                    <tr key={issue._id || idx} className="border-b border-slate-100 text-[13px] transition hover:bg-slate-50">
                      <td className="px-4 py-3.5 font-extrabold text-brand-purple">{issue.ticketId}</td>
                      <td className="px-4 py-3.5"><Badge tone={ACCOUNT_CATEGORY_TONE[catKey]}>{ACCOUNT_CATEGORY_LABEL[catKey]}</Badge></td>
                      <td className="px-4 py-3.5 font-bold text-brand-orange">{issue.trackingNumber}</td>
                      <td className="px-4 py-3.5 font-semibold text-gray-700">{issue.category}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-gray-800">{issue.reporterName || 'Customer'}</div>
                        <div className="text-[11px] text-gray-500">{issue.reporterEmail || issue.reporterPhone || 'Mobile App'}</div>
                      </td>
                      <td className="px-4 py-3.5"><Badge tone={STATUS_TONE[issue.status] || 'red'}>{issue.status}</Badge></td>
                      <td className="px-4 py-3.5">
                        {issue.evidenceImages && issue.evidenceImages.length > 0 ? (
                          <Badge tone="purple" icon={Camera}>{issue.evidenceImages.length} Photo{issue.evidenceImages.length > 1 ? 's' : ''}</Badge>
                        ) : (
                          <span className="text-[11px] text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{dateStr}</td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => handleOpenDetail(issue)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-xs font-bold text-white transition hover:bg-orange-600 active:scale-95"
                        >
                          <Eye size={13} /> View &amp; Resolve
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <CardFooter
          resultsLabel={`Showing ${filteredIssues.length} of ${issues.length} results`}
          pills={[
            { label: 'Open', value: stats.open, tone: 'red' },
            { label: 'Investigating', value: stats.investigating, tone: 'amber' },
            { label: 'Resolved', value: stats.resolved, tone: 'green' },
          ]}
        />
      </div>

      {/* Pagination */}
      {!loading && filteredIssues.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalRecords={filteredIssues.length}
          rowsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
        />
      )}
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
          cardStyle={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}
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
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-muted"><Package size={12} /> PARCEL TRACKING NUMBER</div>
                <div className="mt-0.5 text-[15px] font-extrabold text-brand-orange">{selectedIssue.trackingNumber}</div>
              </div>
              <div className="rounded-lg bg-brand-purple-50 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-muted"><Tag size={12} /> ISSUE CATEGORY</div>
                <div className="mt-0.5 text-sm font-extrabold text-brand-purple">{selectedIssue.category}</div>
              </div>
            </div>

            {/* Reporter Details */}
            <div className="mb-4 rounded-lg border border-brand-purple-200 bg-white p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-brand-purple"><User size={13} /> Reporter Information</div>
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
                    placeholder="Enter resolution notes, refund confirmation, or courier action taken..."
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
