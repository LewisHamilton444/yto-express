import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './services/api';
import Modal from './components/ui/Modal';
import DataTable from './components/ui/DataTable';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import PageHeader from './components/ui/PageHeader';
import Badge from './components/ui/Badge';
import SectionCard from './components/ui/SectionCard';
import StatCard from './components/ui/StatCard';
import { useToast } from './components/ui/useToast';
import CardFooter from './components/ui/CardFooter';
import FilterBar from './components/ui/FilterBar';
import PaginationControls from './PaginationControls';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import { Hash, User, Mail, Shield, ShieldCheck, Activity, Calendar, X, Users, ClipboardList, Package } from 'lucide-react';

const ROLE_LABELS = {
  super_admin:  'Super Admin',
  staff:        'Staff',
  hub_receiver: 'Hub Receiver',
};

const ROLE_COLORS = {
  super_admin:  { bg: '#f0eafa', color: '#5b21b6' },
  staff:        { bg: '#e0f0ff', color: '#1e5f9e' },
  hub_receiver: { bg: '#fef3c7', color: '#92400e' },
};

const TABLE_HEADERS = [
  { label: 'Admin ID', icon: Hash },
  { label: 'Full Admin Name', icon: User },
  { label: 'Email Address', icon: Mail },
  { label: 'Role', icon: Shield },
  { label: 'Status', icon: Activity },
  { label: 'Date Created', icon: Calendar },
  { label: 'Actions', icon: null },
];

const ACCOUNT_EXPORT_COLUMNS = [
  { key: 'adminId', label: 'Admin ID' },
  { key: 'name', label: 'Full Admin Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'createdDate', label: 'Date Created' },
];

// No local fallback rows: an empty or unreachable accounts collection renders
// its error/empty state instead of impersonating placeholder admin people.

export default function ManageAccounts() {
  const [accounts,     setAccounts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [roleFilter,   setRoleFilter]   = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage,   setCurrentPage]  = useState(1);
  const [rowsPerPage,   setRowsPerPage]  = useState(10);
  const [showModal,    setShowModal]    = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(null);
  const [showFormPass, setShowFormPass] = useState(false);
  const toast = useToast();

  const blankForm = { name: '', email: '', role: 'staff', password: '' };
  const [formData, setFormData] = useState(blankForm);

  // ── Fetch all accounts on mount ──────────────────────────────────────────
  const flash = useCallback((msg, type = 'success') => toast(msg, type === 'error' ? 'error' : 'success'), [toast]);

  const [fetchError,    setFetchError]    = useState('');
  const [lastUpdated,   setLastUpdated]   = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await apiFetch('/accounts');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setAccounts([]);
      setFetchError('Could not reach the accounts list. Check your connection, then refresh to try again.');
      flash('Could not reach the accounts list. Please refresh to try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const openAddModal = () => {
    setEditingAccount(null);
    setFormData(blankForm);
    setShowFormPass(false);
    setShowModal(true);
  };

  const openEditModal = (account) => {
    setEditingAccount(account);
    setFormData({ name: account.name, email: account.email, role: account.role, password: '' });
    setShowFormPass(false);
    setShowModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ── Create or Update account ──────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      flash('Name and email are required.', 'error'); return;
    }
    if (!editingAccount && !formData.password.trim()) {
      flash('Password is required for new accounts.', 'error'); return;
    }

    try {
      if (editingAccount) {
        // PUT update
        const body = { name: formData.name, email: formData.email, role: formData.role };
        if (formData.password.trim()) body.password = formData.password;
        const res = await apiFetch(`/accounts/${editingAccount._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { flash(data.error || 'Failed to update account.', 'error'); return; }
        setAccounts(prev => prev.map(a => a._id === data._id ? data : a));
        flash('Account updated successfully.', 'success');
      } else {
        // POST create
        const res = await apiFetch('/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) { flash(data.error || 'Failed to create account.', 'error'); return; }
        setAccounts(prev => [...prev, data]);
        flash('Account created successfully.', 'success');
      }
      setShowModal(false);
    } catch {
      flash('Server error. Please try again.', 'error');
    }
  };

  // ── Toggle Active / Deactivated ───────────────────────────────────────────
  const handleToggleStatus = (account) => {
    if (account.role === 'super_admin') return;
    if (account.status === 'Active') {
      setShowDeactivateConfirm(account);
    } else {
      confirmToggle(account);
    }
  };

  const confirmToggle = async (account) => {
    try {
      const res = await apiFetch(`/accounts/${account._id}/status`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) { flash(data.error || 'Failed to update status.', 'error'); return; }
      setAccounts(prev => prev.map(a => a._id === data._id ? data : a));
      flash(data.status === 'Active' ? 'Account reactivated.' : 'Account deactivated.', 'success');
    } catch {
      flash('Server error. Please try again.', 'error');
    }
    setShowDeactivateConfirm(null);
  };

  const filtered = accounts.filter(a => {
    const term = searchTerm.toLowerCase();
    const matchSearch = (a.name && a.name.toLowerCase().includes(term)) ||
                        (a.email && a.email.toLowerCase().includes(term)) ||
                        (a.adminId && a.adminId.toLowerCase().includes(term));
    const matchRole   = roleFilter   === 'All' || a.role   === roleFilter;
    const matchStatus = statusFilter === 'All' || a.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // Page slice - one page at a time, same as the other ledgers. safePage clamps
  // the page when a filter change shrinks the result set below it.
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const handleClearFilters = () => {
    setSearchTerm('');
    setRoleFilter('All');
    setStatusFilter('All');
  };

  const hasActiveFilters = Boolean(searchTerm || roleFilter !== 'All' || statusFilter !== 'All');

  const handleExport = (format) => {
    const exportData = filtered.map(a => ({
      ...a,
      role: ROLE_LABELS[a.role] || a.role,
    }));
    const title = 'Accounts Directory';
    const filename = 'yto_accounts';
    if (format === 'csv') exportToCSV(exportData, ACCOUNT_EXPORT_COLUMNS, filename);
    else if (format === 'excel') exportToExcel(exportData, ACCOUNT_EXPORT_COLUMNS, filename, title);
    else if (format === 'word') exportToWord(exportData, ACCOUNT_EXPORT_COLUMNS, filename, title);
    else if (format === 'pdf') exportToPDF(exportData, ACCOUNT_EXPORT_COLUMNS, filename, title);
  };

  useEffect(() => { setCurrentPage(1); }, [searchTerm, roleFilter, statusFilter]);
  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    input:       { padding: '10px 14px', background: 'white', border: '1.5px solid #e4d8f2', borderRadius: '10px', color: '#390955', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    select:      { padding: '10px 14px', background: 'white', border: '1.5px solid #e4d8f2', borderRadius: '10px', color: '#390955', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23390955' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'calc(100% - 12px) center', paddingRight: '32px' },
    table:       { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th:          { padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' },
    td:          { padding: '14px 16px', color: '#390955', borderBottom: '1px solid #f3edfb', verticalAlign: 'middle' },
    btnPrimary:  { padding: '9px 18px', borderRadius: '9px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '6px' },
    btnOutline:  { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
    btnDanger:   { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontFamily: 'inherit' },
    btnSuccess:  { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', fontFamily: 'inherit' },
    modalHead:   { background: '#390955', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    label:       { fontSize: '11px', fontWeight: 700, color: '#7b6d8d', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block', marginBottom: '6px' },
  };

  const RoleBadge = ({ role }) => {
    const toneMap = {
      super_admin: 'purple',
      staff: 'blue',
      hub_receiver: 'amber',
    };
    return <Badge tone={toneMap[role] || 'slate'}>{ROLE_LABELS[role] || role}</Badge>;
  };

  const StatusBadge = ({ status }) => (
    <Badge tone={status === 'Active' ? 'green' : 'red'}>
      {status}
    </Badge>
  );

  return (
    <div className="p-6 md:p-8 w-full">
      <div className="space-y-6">
      <PageHeader
        title="Manage Accounts"
        subtitle="Create and manage Staff and Hub Receiver accounts"
        breadcrumb={['Dashboard', 'Manage Accounts']}
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-400 font-medium">Updated {lastUpdated}</span>
            )}
            <RefreshButton onClick={fetchAccounts} isRefreshing={loading} />
            <button style={s.btnPrimary} onClick={openAddModal}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Account
            </button>
          </div>
        }
      />

      {/* Stats */}
      <StatCard.Grid cols={4} className="mb-6">
        <StatCard
          label="Total Accounts"
          value={accounts.length}
          sub="Registered admin personnel"
          tone="purple"
          trend="Total"
          trendTone="neutral"
        />
        <StatCard
          label="Staff"
          value={accounts.filter(a => a.role === 'staff').length}
          sub="Operations and logistics staff"
          tone="blue"
          trend="Staff"
          trendTone="neutral"
        />
        <StatCard
          label="Hub Receivers"
          value={accounts.filter(a => a.role === 'hub_receiver').length}
          sub="Sorting facility personnel"
          tone="orange"
          trend="Receivers"
          trendTone="neutral"
        />
        <StatCard
          label="Active Accounts"
          value={accounts.filter(a => a.status === 'Active').length}
          sub={`${accounts.filter(a => a.status !== 'Active').length} deactivated`}
          tone="emerald"
          trend={accounts.filter(a => a.status === 'Active').length > 0 ? "Healthy" : "None"}
          trendTone="positive"
        />
      </StatCard.Grid>

      {/* Table */}
      <SectionCard
        icon={ShieldCheck}
        title="Account Directory"
        subtitle={`${filtered.length} of ${accounts.length} accounts registered`}
        noPadding
        className="mb-6"
        footer={(
          <CardFooter
            resultsLabel={`Showing ${filtered.length} of ${accounts.length} accounts`}
            pills={[
              { label: 'Active', value: accounts.filter(a => a.status === 'Active').length, tone: 'green' },
              { label: 'Deactivated', value: accounts.filter(a => a.status !== 'Active').length, tone: 'red' },
              { label: 'Staff', value: accounts.filter(a => a.role === 'staff').length, tone: 'blue' },
              { label: 'Hub Receivers', value: accounts.filter(a => a.role === 'hub_receiver').length, tone: 'amber' },
            ]}
          />
        )}
      >
        {/* Control bar - shared FilterBar, same control set as the other ledgers */}
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              aria-label="Search accounts by name, ID, or email"
              placeholder="Search by name, ID, or email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <FilterBar.Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="All">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="staff">Staff</option>
              <option value="hub_receiver">Hub Receiver</option>
            </FilterBar.Select>
            <FilterBar.Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Deactivated">Deactivated</option>
            </FilterBar.Select>
            <FilterBar.Count count={filtered.length} label="results" />
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
            <ExportDropdown onExport={handleExport} disabled={filtered.length === 0} />
          </FilterBar.Actions>
        </FilterBar>
        <div style={{ padding: '8px 24px 24px' }}>
          {fetchError && (
            <div style={{ marginBottom: 12, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>{fetchError}</span>
              <button onClick={fetchAccounts} style={{ ...s.btnOutline, flexShrink: 0 }}>Retry</button>
            </div>
          )}
          <DataTable className="min-w-[960px]" containerClassName="border border-[#e4d8f2] rounded-xl">
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} style={{ padding: '32px 16px' }}>
                    <EmptyState
                      icon={Users}
                      title="No accounts found"
                      description={hasActiveFilters ? 'No accounts match your current filters. Try changing or clearing your filters.' : 'Create a Staff or Hub Receiver account to get started.'}
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
                pageRows.map((account) => (
                  <DataTable.Row key={account._id}>
                    <DataTable.Cell stickyLeft className="font-mono text-xs font-bold text-brand-purple whitespace-nowrap">
                      {account.adminId || '—'}
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#390955] flex items-center justify-center text-xs font-extrabold text-white shrink-0">
                          {account.name ? account.name.charAt(0).toUpperCase() : 'A'}
                        </div>
                        <span className="font-bold text-gray-900">{account.name}</span>
                        {account.role === 'super_admin' && (
                          <span className="text-[9px] bg-[#f37021] text-white px-1.5 py-0.5 rounded font-bold">YOU</span>
                        )}
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell className="text-xs text-gray-500 whitespace-nowrap">
                      {account.email}
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap">
                      <RoleBadge role={account.role} />
                    </DataTable.Cell>
                    <DataTable.Cell className="whitespace-nowrap">
                      <StatusBadge status={account.status} />
                    </DataTable.Cell>
                    <DataTable.Cell tabularNums className="text-xs text-gray-500 whitespace-nowrap">
                      {account.createdDate || '-'}
                    </DataTable.Cell>
                    <DataTable.Cell align="right" className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {account.role === 'super_admin' ? (
                        <span className="text-xs text-purple-400 italic">Protected</span>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(account)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 text-brand-purple text-xs font-bold hover:bg-purple-50 transition opacity-80 group-hover:opacity-100 group-focus-within:opacity-100 whitespace-nowrap"
                          >
                            Edit
                          </button>
                          {account.status === 'Active' ? (
                            <button
                              onClick={() => handleToggleStatus(account)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition whitespace-nowrap"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(account)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition whitespace-nowrap"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      )}
                    </DataTable.Cell>
                  </DataTable.Row>
                ))
              )}
            </tbody>
          </DataTable>

          {/* Pagination inside Card */}
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
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <Modal tint="rgba(26,6,40,0.55)" blur={false} maxWidth={480} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }}>
            <div style={s.modalHead}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 700 }}>{editingAccount ? 'Edit Account' : 'Add New Account'}</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={s.label}>Full Name *</label>
                  <input style={s.input} name="name" value={formData.name} onChange={handleFormChange} placeholder="Enter full name" required />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={s.label}>Email Address *</label>
                  <input style={s.input} type="email" name="email" value={formData.email} onChange={handleFormChange} placeholder="Enter email" required />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={s.label}>Role *</label>
                  <select style={s.select} name="role" value={formData.role} onChange={handleFormChange}>
                    <option value="staff">Staff</option>
                    <option value="hub_receiver">Hub Receiver</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={s.label}>{editingAccount ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input style={{ ...s.input, paddingRight: '40px' }} type={showFormPass ? 'text' : 'password'} name="password" value={formData.password} onChange={handleFormChange} placeholder={editingAccount ? 'Leave blank to keep current' : 'Enter password'} required={!editingAccount} />
                    <button type="button" onClick={() => setShowFormPass(p => !p)} style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#a890c0' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showFormPass ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ background: '#faf7fd', border: '1px solid #e4d8f2', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#7b6d8d', lineHeight: 1.6 }}>
                {formData.role === 'staff'
                  ? <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}><ClipboardList size={14} aria-hidden="true" /> Staff can manage sellers, parcels, and riders. No access to system settings or account management.</span>
                  : <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}><Package size={14} aria-hidden="true" /> Hub Receiver can only mark parcels as Received or Returned at the hub. Limited access.</span>}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button type="button" style={s.btnOutline} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" style={{ ...s.btnPrimary, padding: '10px 22px', fontSize: '13px' }}>
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Deactivate Confirm Modal */}
      {showDeactivateConfirm && (
        <Modal tint="rgba(26,6,40,0.55)" blur={false} maxWidth={400} padding={0} cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' }}>
            <div style={s.modalHead}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 700 }}>Deactivate Account</h3>
              <button onClick={() => setShowDeactivateConfirm(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '14px', color: '#390955', lineHeight: 1.6, marginBottom: '8px' }}>
                Are you sure you want to deactivate <strong>{showDeactivateConfirm.name}</strong>'s account?
              </p>
              <p style={{ fontSize: '13px', color: '#a890c0', marginBottom: '24px' }}>
                They will no longer be able to log in. You can reactivate anytime.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button style={s.btnOutline} onClick={() => setShowDeactivateConfirm(null)}>Cancel</button>
                <button style={{ ...s.btnDanger, padding: '9px 18px', fontSize: '13px' }} onClick={() => confirmToggle(showDeactivateConfirm)}>Yes, Deactivate</button>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}