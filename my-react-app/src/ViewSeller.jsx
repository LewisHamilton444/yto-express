'use client';
import React, { useState, useEffect, useRef } from 'react';
import './ViewSeller.css';
import { normalizeSeller, mockSellers, formatStatusLabel, SELLER_STATUS } from './sellerRiderData';
import PaginationControls from './PaginationControls';
import { exportToCSV, exportToExcel } from './exportUtils';

const SELLER_EXPORT_COLUMNS = [
  { key: 'sellerId', label: 'Seller ID' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'paymentCycle', label: 'Payment Cycle' },
  { key: 'commissionRate', label: 'Commission Rate (%)' },
  { key: 'status', label: 'Status' },
];

const STATUS_COLORS = {
  ACTIVE:                { bg: '#d1fae5', color: '#065f46' },
  PENDING_VERIFICATION:  { bg: '#fef3c7', color: '#92400e' },
  ARCHIVED:              { bg: '#fee2e2', color: '#991b1b' },
};

const GenerateSellerReport = ({ sellers: externalSellers, onUpdateSellers }) => {
  const [sellers, setSellers] = useState(() => (externalSellers ?? []).map(normalizeSeller));
  const sellersRef = useRef(sellers);

  useEffect(() => {
    const fetchSellers = async () => {
      try {
        const response = await fetch('http://https://yto-express.onrender.com/api/sellers');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        const normalized = data.map(normalizeSeller);
        setSellers(normalized);
        sellersRef.current = normalized;
      } catch (err) {
        console.error("Error fetching sellers:", err);
        setSellers(mockSellers);
        sellersRef.current = mockSellers;
      }
    };
    fetchSellers();
  }, []);

  const applyUpdate = (next) => {
    sellersRef.current = next;
    setSellers(next);
    onUpdateSellers?.(next);
  };

  const [searchTerm,    setSearchTerm]    = useState('');
  const [statusFilter,  setStatusFilter]  = useState('All');
  const [editingSeller, setEditingSeller] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [detailSeller,  setDetailSeller]  = useState(null);
  const [currentPage,   setCurrentPage]   = useState(1);
  const [recordsPerPage,setRecordsPerPage]= useState(10);
  const [saveError,     setSaveError]     = useState('');
  const [saveSuccess,   setSaveSuccess]   = useState('');

  // Archived sellers live in Settings > Archived Records now, not here.
  const filteredSellers = sellers.filter(seller => {
    if (seller.status === SELLER_STATUS.ARCHIVED) return false;
    const matchesSearch =
      seller.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller.sellerId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || seller.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const indexOfLastRecord  = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords     = filteredSellers.slice(indexOfFirstRecord, indexOfLastRecord);

  const handleSearchChange       = (e) => { setSearchTerm(e.target.value);   setCurrentPage(1); };
  const handleStatusFilterChange = (e) => { setStatusFilter(e.target.value); setCurrentPage(1); };

  const handleExportCSV = () => exportToCSV(filteredSellers, SELLER_EXPORT_COLUMNS, 'sellers-ledger');
  const handleExportExcel = () => exportToExcel(filteredSellers, SELLER_EXPORT_COLUMNS, 'sellers-ledger');

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess('');
    try {
      const updateData = {
        fullName:   editingSeller.fullName,
        idType:     editingSeller.idType,
        idNumber:   editingSeller.governmentIdNumber,
        email:      editingSeller.email,
        phone:      editingSeller.phone,
        address:    editingSeller.address.street,
        city:       editingSeller.address.city,
        state:      editingSeller.address.state,
        postalCode: editingSeller.address.postalCode,
        country:    editingSeller.address.country,
        bankName:   editingSeller.bankName,
        paymentCycle:   editingSeller.paymentCycle,
        commissionRate: editingSeller.commissionRate,
      };

      const response = await fetch(`http://https://yto-express.onrender.com/api/sellers/${editingSeller._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to save');

      const next = sellersRef.current.map(s =>
        s._id === editingSeller._id ? { ...s, ...editingSeller } : s
      );
      applyUpdate(next);
      setSaveSuccess('Changes saved successfully!');
      setTimeout(() => {
        setShowEditModal(false);
        setEditingSeller(null);
        setSaveSuccess('');
      }, 1000);
    } catch (err) {
      console.error('Error saving changes:', err);
      setSaveError('Failed to save. Check your backend connection.');
    }
  };

  const s = {
    main:        { flex: 1, padding: '24px 30px 48px', minHeight: '100vh', background: '#f0ecf7', fontFamily: "'DM Sans', sans-serif", color: '#390955' },
    header:      { marginBottom: '24px', background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(57,9,85,0.07)' },
    h1:          { fontSize: '22px', fontWeight: 800, color: '#390955', margin: 0, letterSpacing: '-0.5px' },
    subtitle:    { color: '#a890c0', fontSize: '13px', margin: '3px 0 0', fontWeight: 500 },
    panel:       { background: 'white', border: '1px solid rgba(57,9,85,0.08)', borderRadius: '16px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(57,9,85,0.04)', overflow: 'hidden' },
    panelHeader: { padding: '16px 24px', background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    panelHeading:{ fontSize: '15px', fontWeight: 700, color: 'white', margin: 0 },
    panelBody:   { padding: '24px' },
    formInput:   { padding: '10px 14px', background: 'white', border: '1.5px solid #e4d8f2', borderRadius: '10px', color: '#390955', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    table:       { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th:          { padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'white', background: '#390955', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' },
    td:          { padding: '14px 16px', color: '#390955', borderBottom: '1px solid #f3edfb' },
    btnPrimary:  { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#f37021', color: 'white', border: 'none', fontFamily: 'inherit' },
    btnOutline:  { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: 'white', color: '#390955', border: '1.5px solid #e4d8f2', fontFamily: 'inherit' },
    btnDanger:   { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', fontFamily: 'inherit' },
    btnSuccess:  { padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', fontFamily: 'inherit' },
    modalOverlay:{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,6,40,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' },
    paginationBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '8px' },
    paginationInfo:{ fontSize: '13px', fontWeight: 500, color: '#a890c0' },
    paginationBtns:{ display: 'inline-flex', gap: '8px' },
    detailRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 },
    detailLabel: { color: '#a890c0', fontWeight: 600 },
    detailValue: { color: '#390955', fontWeight: 700, textAlign: 'right' },
    detailSection:{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '18px 0 6px' },
  };

  return (
    <div style={s.main}>
      <header style={s.header}>
        <h1 style={s.h1}>Seller Profiles Management</h1>
        <p style={s.subtitle}>Search and update seller records · Archiving is managed in Settings &gt; Archived Records</p>
      </header>

      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h2 style={s.panelHeading}>Search & Status Directives</h2>
        </div>
        <div style={s.panelBody}>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Search Seller Name or ID</label>
              <input type="text" placeholder="Type to filter lookup..." style={s.formInput} value={searchTerm} onChange={handleSearchChange} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Profile Lifecycle Status</label>
              <select style={s.formInput} value={statusFilter} onChange={handleStatusFilterChange}>
                <option value="All">All Statuses</option>
                <option value={SELLER_STATUS.PENDING_VERIFICATION}>Pending Verification</option>
                <option value={SELLER_STATUS.ACTIVE}>Active Only</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.panelHeader}>
          <h2 style={s.panelHeading}>Registered Sellers Ledger</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
              {filteredSellers.length} {filteredSellers.length === 1 ? 'seller' : 'sellers'}
            </span>
            <button style={{ ...s.btnOutline, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.3)' }} onClick={handleExportCSV}>Export CSV</button>
            <button style={{ ...s.btnOutline, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.3)' }} onClick={handleExportExcel}>Export Excel</button>
          </div>
        </div>

        <div style={{ padding: '8px 24px 24px' }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e4d8f2', borderRadius: '12px' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Seller ID</th>
                  <th style={s.th}>Full Name</th>
                  <th style={s.th}>Contact Point (Email/Phone)</th>
                  <th style={s.th}>Payment Cycle / Commission</th>
                  <th style={s.th}>Status</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ ...s.td, textAlign: 'center', padding: '48px', color: '#a890c0', fontWeight: 500 }}>
                      No records match the current view.
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((seller, idx) => {
                    const statusStyle = STATUS_COLORS[seller.status] || STATUS_COLORS.ACTIVE;
                    return (
                      <tr key={seller._id || idx} style={{ background: idx % 2 === 0 ? 'white' : '#faf7fd' }}>
                        <td style={{ ...s.td, fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: '12px' }}>{seller.sellerId}</td>
                        <td style={{ ...s.td, fontWeight: 700 }}>{seller.fullName || '—'}</td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 500 }}>{seller.email}</div>
                          <div style={{ fontSize: '11.5px', color: '#a890c0', marginTop: '2px' }}>{seller.phone}</div>
                        </td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 600 }}>{seller.paymentCycle}</div>
                          <div style={{ fontSize: '11.5px', color: '#a890c0', marginTop: '2px' }}>{seller.commissionRate}% commission</div>
                        </td>
                        <td style={s.td}>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '100px',
                            background: statusStyle.bg, color: statusStyle.color,
                          }}>
                            {formatStatusLabel(seller.status)}
                          </span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button style={s.btnOutline} onClick={() => setDetailSeller(seller)}>
                              View Details
                            </button>
                            <button style={s.btnOutline} onClick={() => { setEditingSeller({ ...seller, address: { ...seller.address } }); setShowEditModal(true); }}>
                              Edit Info
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            currentPage={currentPage}
            totalRecords={filteredSellers.length}
            rowsPerPage={recordsPerPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={(n) => { setRecordsPerPage(n); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* DETAIL VIEW MODAL — full bank + address info */}
      {detailSeller && (
        <div style={s.modalOverlay} onClick={() => setDetailSeller(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
            <div style={{ background: '#390955', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 700 }}>{detailSeller.fullName || 'Seller'}</h3>
                <p style={{ color: 'rgba(255,255,255,0.6)', margin: '2px 0 0', fontSize: '12px' }}>{detailSeller.sellerId}</p>
              </div>
              <button onClick={() => setDetailSeller(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '20px 24px 24px' }}>
              <div style={s.detailSection}>Identification</div>
              <div style={s.detailRow}><span style={s.detailLabel}>ID Type</span><span style={s.detailValue}>{detailSeller.idType}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Government ID No.</span><span style={s.detailValue}>{detailSeller.governmentIdNumber || '—'}</span></div>

              <div style={s.detailSection}>Contact Point</div>
              <div style={s.detailRow}><span style={s.detailLabel}>Email</span><span style={s.detailValue}>{detailSeller.email || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Phone</span><span style={s.detailValue}>{detailSeller.phone || '—'}</span></div>

              <div style={s.detailSection}>Address</div>
              <div style={s.detailRow}><span style={s.detailLabel}>Street</span><span style={s.detailValue}>{detailSeller.address.street || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>City</span><span style={s.detailValue}>{detailSeller.address.city || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>State / Province</span><span style={s.detailValue}>{detailSeller.address.state || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Postal Code</span><span style={s.detailValue}>{detailSeller.address.postalCode || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Country</span><span style={s.detailValue}>{detailSeller.address.country || '—'}</span></div>

              <div style={s.detailSection}>Bank & Payout</div>
              <div style={s.detailRow}><span style={s.detailLabel}>Bank Name</span><span style={s.detailValue}>{detailSeller.bankName || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Account Number</span><span style={s.detailValue}>{detailSeller.accountNumber || '—'}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Payment Cycle</span><span style={s.detailValue}>{detailSeller.paymentCycle}</span></div>
              <div style={s.detailRow}><span style={s.detailLabel}>Commission Rate</span><span style={s.detailValue}>{detailSeller.commissionRate}%</span></div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button style={s.btnOutline} onClick={() => setDetailSeller(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingSeller && (
        <div style={s.modalOverlay}>
          <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '500px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#390955', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 700 }}>Update Profile Details</h3>
              <button onClick={() => { setShowEditModal(false); setEditingSeller(null); setSaveError(''); setSaveSuccess(''); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSaveChanges} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>

              {saveError   && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>❌ {saveError}</div>}
              {saveSuccess && <div style={{ background: '#d1fae5', color: '#065f46', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>✅ {saveSuccess}</div>}

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Full Name</label>
                <input type="text" required style={s.formInput} value={editingSeller.fullName || ''} onChange={e => setEditingSeller({ ...editingSeller, fullName: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>ID Type</label>
                <select style={s.formInput} value={editingSeller.idType || 'National ID'} onChange={e => setEditingSeller({ ...editingSeller, idType: e.target.value })}>
                  <option>National ID</option>
                  <option>Passport</option>
                  <option>Driver's License</option>
                  <option>PhilSys ID</option>
                  <option>Postal ID</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Government ID Number</label>
                <input type="text" required style={s.formInput} value={editingSeller.governmentIdNumber || ''} onChange={e => setEditingSeller({ ...editingSeller, governmentIdNumber: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Email</label>
                <input type="email" required style={s.formInput} value={editingSeller.email || ''} onChange={e => setEditingSeller({ ...editingSeller, email: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Phone</label>
                <input type="text" required style={s.formInput} value={editingSeller.phone || ''} onChange={e => setEditingSeller({ ...editingSeller, phone: e.target.value })} />
              </div>

              <div style={s.detailSection}>Address</div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Street</label>
                <input type="text" style={s.formInput} value={editingSeller.address.street || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, street: e.target.value } })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>City</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.city || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, city: e.target.value } })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>State / Province</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.state || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, state: e.target.value } })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Postal Code</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.postalCode || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, postalCode: e.target.value } })} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Country</label>
                  <input type="text" style={s.formInput} value={editingSeller.address.country || ''} onChange={e => setEditingSeller({ ...editingSeller, address: { ...editingSeller.address, country: e.target.value } })} />
                </div>
              </div>

              <div style={s.detailSection}>Bank & Payout</div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Bank Name</label>
                <input type="text" style={s.formInput} value={editingSeller.bankName || ''} onChange={e => setEditingSeller({ ...editingSeller, bankName: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Payment Cycle</label>
                  <select style={s.formInput} value={editingSeller.paymentCycle || 'Weekly'} onChange={e => setEditingSeller({ ...editingSeller, paymentCycle: e.target.value })}>
                    <option>Daily</option><option>Weekly</option><option>Bi-weekly</option><option>Monthly</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#a890c0', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Commission Rate (%)</label>
                  <input type="number" style={s.formInput} value={editingSeller.commissionRate ?? 0} onChange={e => setEditingSeller({ ...editingSeller, commissionRate: Number(e.target.value) })} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" style={s.btnOutline} onClick={() => { setShowEditModal(false); setEditingSeller(null); setSaveError(''); setSaveSuccess(''); }}>Cancel</button>
                <button type="submit" style={s.btnPrimary}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerateSellerReport;
