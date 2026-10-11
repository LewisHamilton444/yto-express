import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './services/api';
import SectionCard from './components/ui/SectionCard';
import Badge from './components/ui/Badge';
import PageHeader from './components/ui/PageHeader';
import DataTable from './components/ui/DataTable';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import FilterBar from './components/ui/FilterBar';
import PaginationControls from './PaginationControls';
import RefreshButton from './components/ui/RefreshButton';
import { ShieldCheck, X } from 'lucide-react';

// Security audit trail (SH-09) — Super Admin only (sidebar + GET /api/audit-logs).
// Paging and filtering happen on the server, so this page only ever holds one
// page of entries.

const ACTION_LABELS = {
  login_success:         'Login',
  login_failure:         'Failed login',
  account_created:       'Account created',
  account_updated:       'Account updated',
  role_changed:          'Role changed',
  account_activated:     'Account activated',
  account_deactivated:   'Account deactivated',
  parcel_status_changed: 'Parcel status changed',
  rider_assigned:        'Rider assigned',
  delivery_attempt_failed: 'Failed delivery attempt',
  database_reset:        'Data reset',
};

const ROLE_LABELS = {
  super_admin:  'Super Admin',
  staff:        'Operations Staff',
  hub_receiver: 'Hub Receiver',
  rider_app:    'Rider App',
  anonymous:    'Unknown',
};

const TABLE_HEADERS = ['Date & Time', 'User', 'Role', 'Action', 'Target', 'Result', 'IP Address'];

// One short line from the hand-picked `details` the server stored.
function describeDetails(details = {}) {
  if (details.from !== undefined || details.to !== undefined) {
    return `${details.from || '(none)'} → ${details.to || '(none)'}`;
  }
  if (Array.isArray(details.fields)) return `Changed: ${details.fields.join(', ') || 'nothing'}`;
  if (details.reason) return details.reason;
  if (details.role) return `Role: ${ROLE_LABELS[details.role] || details.role}`;
  if (details.sellersDeleted !== undefined) {
    return `${details.sellersDeleted} sellers, ${details.ridersDeleted} riders removed`;
  }
  return '';
}

function formatTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function AuditTrail() {
  const [logs, setLogs]                 = useState([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [currentPage, setCurrentPage]   = useState(1);
  const [rowsPerPage, setRowsPerPage]   = useState(25);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage) });
      if (actionFilter) params.set('action', actionFilter);
      if (resultFilter) params.set('result', resultFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      const res = await apiFetch(`/audit-logs?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load the audit trail. Please try again.');
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, rowsPerPage, actionFilter, resultFilter, sourceFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Any filter change starts again from page 1.
  const changeFilter = (setter) => (e) => { setter(e.target.value); setCurrentPage(1); };
  const hasActiveFilters = Boolean(actionFilter || resultFilter || sourceFilter);
  const clearFilters = () => { setActionFilter(''); setResultFilter(''); setSourceFilter(''); setCurrentPage(1); };

  return (
    <div className="p-6 md:p-8 w-full space-y-6">
      <PageHeader
        title="Audit Trail"
        subtitle="Security record of sign-ins, account changes, parcel changes and data resets"
        breadcrumb={['Dashboard', 'Admin', 'Audit Trail']}
        actions={<RefreshButton onClick={fetchLogs} isRefreshing={loading} />}
      />

      <SectionCard
        icon={ShieldCheck}
        title="Security Events"
        subtitle="Newest first · entries are kept for 1 year"
        noPadding
      >
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Select aria-label="Filter by action" value={actionFilter} onChange={changeFilter(setActionFilter)}>
              <option value="">All Actions</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </FilterBar.Select>
            <FilterBar.Select aria-label="Filter by result" value={resultFilter} onChange={changeFilter(setResultFilter)}>
              <option value="">All Results</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </FilterBar.Select>
            <FilterBar.Select aria-label="Filter by source" value={sourceFilter} onChange={changeFilter(setSourceFilter)}>
              <option value="">All Sources</option>
              <option value="admin_panel">Admin Panel</option>
              <option value="rider_app">Rider App</option>
            </FilterBar.Select>
            <FilterBar.Count count={total} label="events" />
          </FilterBar.Group>
          <FilterBar.Actions>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <X size={13} aria-hidden="true" /> Clear Filters
              </button>
            )}
          </FilterBar.Actions>
        </FilterBar>

        <DataTable className="min-w-[960px]">
          <DataTable.Head>
            <tr>
              {TABLE_HEADERS.map((h, i) => (
                <DataTable.Th key={h} stickyLeft={i === 0}>{h}</DataTable.Th>
              ))}
            </tr>
          </DataTable.Head>
          <tbody>
            {loading ? (
              <TableSkeleton rows={8} columns={TABLE_HEADERS.length} />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={TABLE_HEADERS.length} className="p-6">
                  <EmptyState
                    icon={ShieldCheck}
                    title={error ? 'Audit trail unavailable' : 'No audit events'}
                    description={error || (hasActiveFilters ? 'No events match your filters.' : 'Security events will appear here as they happen.')}
                  />
                </td>
              </tr>
            ) : logs.map((log) => {
              const extra = describeDetails(log.details);
              return (
                <DataTable.Row key={log._id}>
                  <DataTable.Cell stickyLeft tabularNums className="whitespace-nowrap text-[#55436a]">{formatTime(log.createdAt)}</DataTable.Cell>
                  <DataTable.Cell className="whitespace-nowrap font-semibold">
                    {log.actorEmail || log.actorId || '—'}
                    {log.source === 'rider_app' && log.actorId && (
                      <span className="block text-[11px] font-medium text-slate-400">Rider ID</span>
                    )}
                  </DataTable.Cell>
                  <DataTable.Cell>
                    <Badge tone={log.source === 'rider_app' ? 'orange' : 'purple'} uppercase={false}>
                      {ROLE_LABELS[log.actorRole] || log.actorRole || '—'}
                    </Badge>
                  </DataTable.Cell>
                  <DataTable.Cell className="whitespace-nowrap">
                    <span className="font-semibold text-[#390955]">{ACTION_LABELS[log.action] || log.action}</span>
                    {extra && <span className="block text-[11px] text-slate-500">{extra}</span>}
                  </DataTable.Cell>
                  <DataTable.Cell className="whitespace-nowrap font-mono text-xs">{log.target || '—'}</DataTable.Cell>
                  <DataTable.Cell>
                    <Badge tone={log.result === 'success' ? 'green' : 'red'}>
                      {log.result === 'success' ? 'Success' : 'Failure'}
                    </Badge>
                  </DataTable.Cell>
                  <DataTable.Cell className="whitespace-nowrap font-mono text-xs text-slate-500">{log.ip || '—'}</DataTable.Cell>
                </DataTable.Row>
              );
            })}
          </tbody>
        </DataTable>

        <div className="px-6 pb-5">
          <PaginationControls
            currentPage={currentPage}
            totalRecords={total}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[25, 50, 100, 200]}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
          />
        </div>
      </SectionCard>
    </div>
  );
}
