import React, { useState, useEffect } from 'react';

// Vite exposes env vars via import.meta.env (not process.env — that's a
// Create React App convention and would be undefined here). Set
// VITE_API_URL in a .env file to point at a different backend (e.g. local
// dev); otherwise this falls back to the live Render API.
const API_BASE = import.meta.env.VITE_API_URL || 'https://yto-express.onrender.com/api';
const API = `${API_BASE}/accounts`;

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

// Shown only when the real API is unreachable or returns nothing, so the
// layout stays testable offline. Clearly labeled in the UI (see the banner
// below) rather than silently standing in for real records — an admin
// screen that can activate/deactivate accounts should never let someone
// mistake sample rows for real ones.
const MOCK_ACCOUNTS = [
  { _id: 'mock-1', name: 'Sample Staff',        email: 'staff.sample@ytoexpress.ph', phone: '09171234567', role: 'staff',        status: 'Active',      createdDate: '2026-01-15' },
  { _id: 'mock-2', name: 'Sample Hub Receiver', email: 'hub.sample@ytoexpress.ph',   phone: '09179876543', role: 'hub_receiver', status: 'Active',      createdDate: '2026-02-03' },
  { _id: 'mock-3', name: 'Jane Dela Cruz',      email: 'jane.delacruz@ytoexpress.ph',phone: '09051112222', role: 'staff',        status: 'Deactivated', createdDate: '2025-11-20' },
];

export default function ManageAccounts({ currentUser }) {
  const [accounts,     setAccounts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [roleFilter,   setRoleFilter]   = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal,    setShowModal]    = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [successMsg,   setSuccessMsg]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(null);
  const [showFormPass, setShowFormPass] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);

  const blankForm = { name: '', email: '', phone: '', role: 'staff', password: '' };
  const [formData, setFormData] = useState(blankForm);

  // ── Fetch all accounts on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setAccounts(data);
        setUsingMockData(false);
      } else {
        // Backend reachable but empty — fall back so the layout stays
        // testable, but say so rather than pretending it's real data.
        setAccounts(MOCK_ACCOUNTS);
        setUsingMockData(true);
      }
    } catch (err) {
      setAccounts(MOCK_ACCOUNTS);
      setUsingMockData(true);
      flash('Could not reach the server — showing sample data instead.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const flash = (msg, type) => {
    if (type === 'success') { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); }
    else                    { setErrorMsg(msg);   setTimeout(() => setErrorMsg(''), 3000); }
  };

  const openAddModal = () => {
    setEditingAccount(null);
    setFormData(blankForm);
    setShowFormPass(false);
    setShowModal(true);
  };

  const openEditModal = (account) => {
    setEditingAccount(account);
    setFormData({ name: account.name, email: account.email, phone: account.phone || '', role: account.role, password: '' });
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
        const body = { name: formData.name, email: formData.email, phone: formData.phone, role: formData.role };
        if (formData.password.trim()) body.password = formData.password;
        const res = await fetch(`${API}/${editingAccount._id}`, {
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
        const res = await fetch(API, {
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
    } catch (err) {
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
      const res = await fetch(`${API}/${account._id}/status`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) { flash(data.error || 'Failed to update status.', 'error'); return; }
      setAccounts(prev => prev.map(a => a._id === data._id ? data : a));
      flash(data.status === 'Active' ? 'Account reactivated.' : 'Account deactivated.', 'success');
    } catch (err) {
      flash('Server error. Please try again.', 'error');
    }
    setShowDeactivateConfirm(null);
  };

  const filtered = accounts.filter(a => {
    const matchSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole   = roleFilter   === 'All' || a.role   === roleFilter;
    const matchStatus = statusFilter === 'All' || a.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    main:        { flex: 1, padding: '24px 30px 48px', minHeight: '100vh', background: '#f0ecf7', fontFamily: "'DM Sans', sans-serif", color: '#390955' },
    header:      { marginBottom: '24px', background: 'white', padding: '20px 24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(57,9,85,0.07)' },
    h1:          { fontSize: '22px', fontWeight: 800, color: '#390955', margin: 0, letterSpacing: '-0.5px' },
    subtitle:    { color: '#a890c0', fontSize: '13px', margin: '4px 0 0', fontWeight: 500 },
    panel:       { background: 'white', border: '1px solid rgba(57,9,85,0.08)', borderRadius: '16px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(57,9,85,0.04)', overflow: 'hidden' },
    panelHeader: { padding: '16px 24px', background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    panelHeading:{ fontSize: '15px', fontWeight: 700, color: 'white', margin: 0 },
    panelBody:   { padding: '24px' },
    input:       { padding: '10px 14px', background: 'white', border: '1.5px solid #e4d8f2', borderRadius: '10px', color: '#390955', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    select:      { padding: '10px 14px', background: 'white', border: '1.5px solid #e4d8f2', borderRadius: '10px', color: '#390955', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23390955' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'calc(100% - 12px) center', paddingRight: '32px' },
    table:       { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th:          { padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'white', background: '#390955', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' },
    td:          { padding: '14px 16px', color: '#390955', borderBottom: '1px solid #f3edfb', verticalAlign: 'middle' },
    btnPrimary:  { padding: '9px 18px', borderRadius: '9px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '6px' },
    btnOutline:  { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
    btnDanger:   { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontFamily: 'inherit' },
    btnSuccess:  { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', fontFamily: 'inherit' },
    modalOverlay:{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,6,40,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
    modalBox:    { background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.18)' },
    modalHead:   { background: '#390955', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    label:       { fontSize: '11px', fontWeight: 700, color: '#7b6d8d', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block', marginBottom: '6px' },
  };

  const RoleBadge = ({ role }) => {
    const c = ROLE_COLORS[role] || { bg: '#f3f3f3', color: '#555' };
    return <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '100px', background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{ROLE_LABELS[role] || role}</span>;
  };

  const StatusBadge = ({ status }) => (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '100px', background: status === 'Active' ? '#d1fae5' : '#fee2e2', color: status === 'Active' ? '#065f46' : '#991b1b' }}>
      {status}
    </span>
  );

  return (
    <div style={s.main}>
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={s.h1}>Manage Accounts</h1>
            <p style={s.subtitle}>Create and manage Staff and Hub Receiver accounts</p>
          </div>
          <button style={s.btnPrimary} onClick={openAddModal}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Account
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', borderTop: '1px solid #f3eff7', paddingTop: '10px' }}>
          {['Dashboard', 'Manage Accounts'].map((item, i, arr) => (
            <React.Fragment key={item}>
              <span style={{ fontSize: '12px', color: i === arr.length - 1 ? '#390955' : '#a890c0', fontWeight: i === arr.length - 1 ? 700 : 500 }}>{item}</span>
              {i < arr.length - 1 && <span style={{ fontSize: '11px', color: '#dcd3e8' }}>/</span>}
            </React.Fragment>
          ))}
        </div>
      </header>

      {successMsg && <div style={{ padding: '14px 20px', background: '#e6f9ed', color: '#1e7e34', border: '1px solid #bbf7d0', borderRadius: '12px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>{successMsg}</div>}
      {errorMsg   && <div style={{ padding: '14px 20px', background: '#fdf2f2', color: '#9b1c1c', border: '1px solid #fecaca', borderRadius: '12px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>{errorMsg}</div>}
      {usingMockData && !loading && (
        <div style={{ padding: '14px 20px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '12px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
          ⚠️ Showing sample accounts — the server didn't return live data. Actions below won't be saved until it's back.
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {[
          { label: 'Total Accounts', value: accounts.length,                                          color: '#390955' },
          { label: 'Staff',          value: accounts.filter(a => a.role === 'staff').length,          color: '#1e5f9e' },
          { label: 'Hub Receivers',  value: accounts.filter(a => a.role === 'hub_receiver').length,   color: '#92400e' },
          { label: 'Active',         value: accounts.filter(a => a.status === 'Active').length,       color: '#065f46' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', border: '1px solid rgba(57,9,85,0.08)', boxShadow: '0 2px 8px rgba(57,9,85,0.04)' }}>
            <div style={{ fontSize: '26px', fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '6px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={s.panel}>
        <div style={s.panelHeader}><h2 style={s.panelHeading}>Search & Filter</h2></div>
        <div style={s.panelBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
            <div><label style={s.label}>Search Name or Email</label><input style={s.input} placeholder="Type to search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <div><label style={s.label}>Role</label>
              <select style={s.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="All">All Roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="staff">Staff</option>
                <option value="hub_receiver">Hub Receiver</option>
              </select>
            </div>
            <div><label style={s.label}>Status</label>
              <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Deactivated">Deactivated</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h2 style={s.panelHeading}>Account Directory</h2>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{filtered.length} {filtered.length === 1 ? 'account' : 'accounts'}</span>
        </div>
        <div style={{ padding: '8px 24px 24px' }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e4d8f2', borderRadius: '12px' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Phone</th>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Date Created</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ ...s.td, textAlign: 'center', padding: '48px', color: '#a890c0' }}>Loading accounts...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="7" style={{ ...s.td, textAlign: 'center', padding: '48px', color: '#a890c0', fontWeight: 500 }}>No accounts found.</td></tr>
                ) : filtered.map((account, idx) => (
                  <tr key={account._id} style={{ background: idx % 2 === 0 ? 'white' : '#faf7fd' }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: 'white', flexShrink: 0 }}>
                          {account.name.charAt(0).toUpperCase()}
                        </div>
                        {account.name}
                        {account.role === 'super_admin' && <span style={{ fontSize: '9px', background: '#f37021', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>YOU</span>}
                      </div>
                    </td>
                    <td style={{ ...s.td, fontSize: '12px' }}>{account.email}</td>
                    <td style={{ ...s.td, color: '#a890c0', fontSize: '12px' }}>{account.phone || '—'}</td>
                    <td style={s.td}><RoleBadge role={account.role} /></td>
                    <td style={s.td}><StatusBadge status={account.status} /></td>
                    <td style={{ ...s.td, color: '#a890c0', fontSize: '12px' }}>{account.createdDate}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {account.role === 'super_admin' ? (
                        <span style={{ fontSize: '11px', color: '#c4b5d4', fontStyle: 'italic' }}>Protected</span>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button style={s.btnOutline} onClick={() => openEditModal(account)}>Edit</button>
                          {account.status === 'Active'
                            ? <button style={s.btnDanger}   onClick={() => handleToggleStatus(account)}>Deactivate</button>
                            : <button style={s.btnSuccess}  onClick={() => handleToggleStatus(account)}>Reactivate</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div style={s.modalOverlay}>
          <div style={s.modalBox}>
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
                <div>
                  <label style={s.label}>Phone Number</label>
                  <input style={s.input} name="phone" value={formData.phone} onChange={handleFormChange} placeholder="e.g. 09171234567" />
                </div>
                <div>
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
                  ? '📋 Staff can manage sellers, parcels, and riders. No access to system settings or account management.'
                  : '📦 Hub Receiver can only mark parcels as Received or Returned at the hub. Limited access.'}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button type="button" style={s.btnOutline} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" style={{ ...s.btnPrimary, padding: '10px 22px', fontSize: '13px' }}>
                  {editingAccount ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirm Modal */}
      {showDeactivateConfirm && (
        <div style={s.modalOverlay}>
          <div style={{ ...s.modalBox, maxWidth: '400px' }}>
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
          </div>
        </div>
      )}
    </div>
  );
}