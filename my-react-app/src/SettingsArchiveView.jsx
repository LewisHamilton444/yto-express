'use client';
import React, { useEffect, useState } from 'react';
import { normalizeSeller, normalizeRider, SELLER_STATUS, RIDER_STATUS } from './sellerRiderData';

const API = 'https://yto-express.onrender.com';

// Archiving/Restoring/Permanently-Deleting sellers & riders all live here now
// — the seller/rider ledger pages (View Seller, Generate Rider Data Report)
// only offer View/Review, so this is the one place the whole archive
// lifecycle happens.
export default function SettingsArchiveView({ onCountsChange = () => {} }) {
  const [subTab, setSubTab]     = useState('sellers'); // 'sellers' | 'riders'
  const [view, setView]         = useState('active');  // 'active' | 'archived'
  const [search, setSearch]     = useState('');
  const [allSellers, setAllSellers] = useState([]);
  const [allRiders, setAllRiders]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [notice, setNotice]     = useState({ show: false, message: '', type: '' });
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: 'seller'|'rider', record }
  const [confirmArchive, setConfirmArchive] = useState(null); // { kind: 'seller'|'rider', record }

  const showNotice = (message, type = 'success') => {
    setNotice({ show: true, message, type });
    setTimeout(() => setNotice({ show: false, message: '', type: '' }), 3000);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${API}/api/sellers`),
        fetch(`${API}/api/riders`),
      ]);
      const [sData, rData] = await Promise.all([sRes.json(), rRes.json()]);
      const sellers = sData.map(normalizeSeller);
      const riders  = rData.map(normalizeRider);
      setAllSellers(sellers);
      setAllRiders(riders);
      onCountsChange({
        sellers: sellers.filter(s => s.status === SELLER_STATUS.ARCHIVED).length,
        riders: riders.filter(r => r.status === RIDER_STATUS.ARCHIVED).length,
      });
    } catch (err) {
      console.error('Error fetching sellers/riders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const activeSellers   = allSellers.filter(s => s.status !== SELLER_STATUS.ARCHIVED);
  const archivedSellers = allSellers.filter(s => s.status === SELLER_STATUS.ARCHIVED);
  const activeRiders     = allRiders.filter(r => r.status !== RIDER_STATUS.ARCHIVED);
  const archivedRiders   = allRiders.filter(r => r.status === RIDER_STATUS.ARCHIVED);

  const matchesSearch = (record) => !search.trim() ||
    record.fullName.toLowerCase().includes(search.trim().toLowerCase()) ||
    (subTab === 'sellers' ? record.sellerId : record.riderId).toLowerCase().includes(search.trim().toLowerCase());

  const handleArchiveSeller = async (seller) => {
    try {
      const res = await fetch(`${API}/api/sellers/${seller._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SELLER_STATUS.ARCHIVED }),
      });
      if (!res.ok) throw new Error('Failed');
      showNotice(`${seller.fullName} archived — moved out of View Seller.`);
      setConfirmArchive(null);
      fetchAll();
    } catch (err) {
      console.error(err);
      showNotice('Failed to archive seller.', 'error');
      setConfirmArchive(null);
    }
  };

  const handleArchiveRider = async (rider) => {
    try {
      const res = await fetch(`${API}/api/riders/${rider._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: RIDER_STATUS.ARCHIVED }),
      });
      if (!res.ok) throw new Error('Failed');
      showNotice(`${rider.fullName} archived — moved off the live map.`);
      setConfirmArchive(null);
      fetchAll();
    } catch (err) {
      console.error(err);
      showNotice('Failed to archive rider.', 'error');
      setConfirmArchive(null);
    }
  };

  const handleRestoreSeller = async (seller) => {
    try {
      const res = await fetch(`${API}/api/sellers/${seller._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SELLER_STATUS.ACTIVE }),
      });
      if (!res.ok) throw new Error('Failed');
      showNotice(`${seller.fullName} restored to Active — visible again in View Seller.`);
      fetchAll();
    } catch (err) {
      console.error(err);
      showNotice('Failed to restore seller.', 'error');
    }
  };

  const handleRestoreRider = async (rider) => {
    try {
      const res = await fetch(`${API}/api/riders/${rider._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: RIDER_STATUS.ACTIVE }),
      });
      if (!res.ok) throw new Error('Failed');
      showNotice(`${rider.fullName} restored to Active — visible again on the live map.`);
      fetchAll();
    } catch (err) {
      console.error(err);
      showNotice('Failed to restore rider.', 'error');
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmDelete) return;
    const { kind, record } = confirmDelete;
    const endpoint = kind === 'seller' ? 'sellers' : 'riders';
    try {
      const res = await fetch(`${API}/api/${endpoint}/${record._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      showNotice(`${record.fullName} permanently deleted.`);
      setConfirmDelete(null);
      fetchAll();
    } catch (err) {
      console.error(err);
      showNotice('Failed to permanently delete record.', 'error');
      setConfirmDelete(null);
    }
  };

  const s = {
    tabs:       { display: 'flex', gap: 8, marginBottom: 16 },
    tabBtn:     (active) => ({ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${active ? '#390955' : '#e0d0f0'}`, background: active ? '#390955' : 'white', color: active ? 'white' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }),
    countBadge: (active) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: '50%', background: active ? 'rgba(255,255,255,0.25)' : 'rgba(57,9,85,0.1)', fontSize: 10, fontWeight: 800 }),
    subTabs:    { display: 'flex', gap: 6, marginBottom: 14 },
    subTabBtn:  (active) => ({ padding: '6px 13px', borderRadius: 20, border: `1.5px solid ${active ? '#390955' : '#e0d0f0'}`, background: active ? '#390955' : 'white', color: active ? 'white' : '#666', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }),
    search:     { padding: '8px 12px', border: '1.5px solid #e0d0f0', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', width: 240, marginBottom: 14 },
    table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th:         { padding: '11px 14px', background: 'linear-gradient(135deg,#390955,#5a1a80)', color: 'rgba(255,255,255,0.85)', textAlign: 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
    td:         { padding: '12px 14px', borderBottom: '1px solid #f3ecfa', color: '#333', verticalAlign: 'middle' },
    btnRestore: { padding: '6px 14px', background: '#390955', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    btnArchive: { padding: '6px 14px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 7, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    btnDelete:  { padding: '6px 14px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 7, fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    emptyState: { textAlign: 'center', padding: '36px 24px', color: '#bbb', fontSize: 13, background: '#fdfcfe', borderRadius: 10, border: '1.5px dashed #e0d0f0' },
    notice:     (type) => ({ padding: '10px 16px', borderRadius: 8, marginBottom: 14, fontWeight: 600, fontSize: 13, background: type === 'error' ? '#fde8f0' : '#e8f5e9', color: type === 'error' ? '#c0392b' : '#2e7d32', border: `1px solid ${type === 'error' ? '#f5c6d0' : '#a5d6a7'}` }),
    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
    modal:      { background: 'white', borderRadius: 12, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
    archivedBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#ede4f5', color: '#6d1a9c', border: '1px solid rgba(109,26,156,0.2)' },
    activeBadge:   { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#d1fae5', color: '#065f46', border: '1px solid rgba(6,95,70,0.2)' },
  };

  const sellersToShow = (view === 'active' ? activeSellers : archivedSellers).filter(matchesSearch);
  const ridersToShow  = (view === 'active' ? activeRiders : archivedRiders).filter(matchesSearch);

  return (
    <div>
      {notice.show && <div style={s.notice(notice.type)}>{notice.message}</div>}

      <div style={s.tabs}>
        <button style={s.tabBtn(subTab === 'sellers')} onClick={() => { setSubTab('sellers'); setSearch(''); }}>
          Sellers
          <span style={s.countBadge(subTab === 'sellers')}>{allSellers.length}</span>
        </button>
        <button style={s.tabBtn(subTab === 'riders')} onClick={() => { setSubTab('riders'); setSearch(''); }}>
          Riders
          <span style={s.countBadge(subTab === 'riders')}>{allRiders.length}</span>
        </button>
      </div>

      <div style={s.subTabs}>
        <button style={s.subTabBtn(view === 'active')} onClick={() => setView('active')}>
          Active ({subTab === 'sellers' ? activeSellers.length : activeRiders.length})
        </button>
        <button style={s.subTabBtn(view === 'archived')} onClick={() => setView('archived')}>
          Archived ({subTab === 'sellers' ? archivedSellers.length : archivedRiders.length})
        </button>
      </div>

      <input
        style={s.search}
        placeholder={`Search by name or ${subTab === 'sellers' ? 'seller' : 'rider'} ID...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#bbb', fontSize: 13 }}>Loading records...</div>
      ) : subTab === 'sellers' ? (
        sellersToShow.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            No {view} sellers{search.trim() ? ' match your search.' : ' at the moment.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #ede4f5' }}>
            <table style={s.table}>
              <thead><tr>{['Seller ID', 'Full Name', 'Email', 'Phone', 'Payment Cycle', 'Status', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {sellersToShow.map((seller, idx) => (
                  <tr key={seller._id} style={{ background: idx % 2 === 0 ? 'white' : '#fdfcfe' }}>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{seller.sellerId}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>{seller.fullName}</td>
                    <td style={s.td}>{seller.email}</td>
                    <td style={s.td}>{seller.phone}</td>
                    <td style={s.td}>{seller.paymentCycle}</td>
                    <td style={s.td}><span style={view === 'active' ? s.activeBadge : s.archivedBadge}>{view === 'active' ? 'Active' : 'Archived'}</span></td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {view === 'active' ? (
                          <button style={s.btnArchive} onClick={() => setConfirmArchive({ kind: 'seller', record: seller })}>Archive</button>
                        ) : (
                          <>
                            <button style={s.btnRestore} onClick={() => handleRestoreSeller(seller)}>↩ Restore</button>
                            <button style={s.btnDelete} onClick={() => setConfirmDelete({ kind: 'seller', record: seller })}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        ridersToShow.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏍️</div>
            No {view} riders{search.trim() ? ' match your search.' : ' at the moment.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #ede4f5' }}>
            <table style={s.table}>
              <thead><tr>{['Rider ID', 'Full Name', 'Email', 'Phone', 'Vehicle', 'Deliveries', 'Status', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {ridersToShow.map((rider, idx) => (
                  <tr key={rider._id} style={{ background: idx % 2 === 0 ? 'white' : '#fdfcfe' }}>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{rider.riderId}</td>
                    <td style={{ ...s.td, fontWeight: 700 }}>{rider.fullName}</td>
                    <td style={s.td}>{rider.email}</td>
                    <td style={s.td}>{rider.phone}</td>
                    <td style={s.td}>{rider.vehicleType}</td>
                    <td style={s.td}>{rider.performance.deliveriesCount}</td>
                    <td style={s.td}><span style={view === 'active' ? s.activeBadge : s.archivedBadge}>{view === 'active' ? 'Active' : 'Archived'}</span></td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {view === 'active' ? (
                          <button style={s.btnArchive} onClick={() => setConfirmArchive({ kind: 'rider', record: rider })}>Archive</button>
                        ) : (
                          <>
                            <button style={s.btnRestore} onClick={() => handleRestoreRider(rider)}>↩ Restore</button>
                            <button style={s.btnDelete} onClick={() => setConfirmDelete({ kind: 'rider', record: rider })}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {confirmArchive && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: '#390955' }}>Archive this {confirmArchive.kind}?</h2>
            <p style={{ fontSize: 14, color: '#666', margin: '0 0 24px' }}>
              <strong>{confirmArchive.record.fullName}</strong> will be removed from {confirmArchive.kind === 'seller' ? 'View Seller' : 'the live map and rider report'}. You can restore them from here any time.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button style={{ padding: '10px 20px', background: 'white', color: '#390955', border: '2px solid #390955', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setConfirmArchive(null)}>Cancel</button>
              <button style={{ padding: '10px 20px', background: '#c0392b', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => confirmArchive.kind === 'seller' ? handleArchiveSeller(confirmArchive.record) : handleArchiveRider(confirmArchive.record)}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: '#c0392b' }}>Permanently Delete Record?</h2>
            <p style={{ fontSize: 14, color: '#666', margin: '0 0 24px' }}>
              This deletes <strong>{confirmDelete.record.fullName}</strong>'s {confirmDelete.kind} record from MongoDB forever. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button style={{ padding: '10px 20px', background: 'white', color: '#390955', border: '2px solid #390955', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={{ padding: '10px 20px', background: '#c0392b', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handlePermanentDelete}>Permanently Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
