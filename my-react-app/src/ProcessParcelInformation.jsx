import React, { useState, useEffect } from 'react';
import './ProcessParcelInformation.css';

const generateTrackingNumber = () => {
  const today = new Date();
  const datePart = today.toISOString().split('T')[0].replace(/-/g, '');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `PKG-${datePart}-${rand}`;
};

const STATUS_META = {
  pending:      { label: 'Pending',    color: '#f59e0b' },
  'in-transit': { label: 'In Transit', color: '#3b82f6' },
  delivered:    { label: 'Delivered',  color: '#10b981' },
  returned:     { label: 'Returned',   color: '#6b7280' },
  failed:       { label: 'Failed',     color: '#ef4444' },
};

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status, color: '#999' };
  return (
    <span className="ppi-badge" style={{ background: meta.color + '20', color: meta.color, border: `1px solid ${meta.color}40` }}>
      {meta.label}
    </span>
  );
};

const emptyAddForm = {
  trackingNumber: '',
  senderName: '', senderPhone: '',
  recipientName: '', recipientPhone: '', recipientAddress: '',
  weight: '', dimensions: '', content: '',
  serviceType: 'standard', shippingCost: '',
  origin: '', destination: '',
  riderId: '', sellerId: '',
};

export default function ProcessParcelInformation() {
  const [activeTab,      setActiveTab]      = useState('add');
  const [parcels,        setParcels]        = useState([]);
  const [riders,         setRiders]         = useState([]);
  const [sellers,        setSellers]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [addForm,        setAddForm]        = useState({ ...emptyAddForm, trackingNumber: generateTrackingNumber() });
  const [updateSearch,   setUpdateSearch]   = useState('');
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [updateForm,     setUpdateForm]     = useState({ status: 'pending', location: '', notes: '' });
  const [deleteSearch,   setDeleteSearch]   = useState('');
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);
  const [retrieveSearch, setRetrieveSearch] = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [viewParcel,     setViewParcel]     = useState(null);
  const [message,        setMessage]        = useState({ text: '', type: '' });

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 3500);
  };

  // ── Fetch all data from MongoDB ──
  const fetchAll = async () => {
    try {
      const [parcelsRes, ridersRes, sellersRes] = await Promise.all([
        fetch('http://https://yto-express.onrender.com/api/parcels'),
        fetch('http://https://yto-express.onrender.com/api/riders'),
        fetch('http://https://yto-express.onrender.com/api/sellers'),
      ]);
      const [parcelsData, ridersData, sellersData] = await Promise.all([
        parcelsRes.json(),
        ridersRes.json(),
        sellersRes.json(),
      ]);
      setParcels(parcelsData);
      setRiders(ridersData);
      setSellers(sellersData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Add Parcel to MongoDB ──
  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const parcelData = {
        ...addForm,
        trackingNumber: addForm.trackingNumber || generateTrackingNumber(),
        status: 'pending',
        location: 'Warehouse',
        events: [{
          time: new Date().toISOString().slice(0,16).replace('T',' '),
          event: 'Parcel registered at warehouse',
          location: 'Warehouse',
          status: 'Pending',
        }],
      };

      const response = await fetch('http://https://yto-express.onrender.com/api/parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parcelData),
      });

      if (!response.ok) throw new Error('Failed to save');

      await fetchAll();
      setAddForm({ ...emptyAddForm, trackingNumber: generateTrackingNumber() });
      showMsg(`Parcel "${parcelData.trackingNumber}" added successfully!`);
    } catch (err) {
      console.error(err);
      showMsg('Error saving parcel to database', 'error');
    }
  };

  // ── Update Parcel in MongoDB ──
  const handleSelectForUpdate = (parcel) => {
    setSelectedParcel(parcel);
    setUpdateForm({ status: parcel.status, location: parcel.location || '', notes: parcel.notes || '' });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const newEvent = {
        time: new Date().toISOString().slice(0,16).replace('T',' '),
        event: `Status updated to ${updateForm.status}`,
        location: updateForm.location || 'Unknown',
        status: updateForm.status,
      };
      const updatedEvents = [...(selectedParcel.events || []), newEvent];

      await fetch(`http://https://yto-express.onrender.com/api/parcels/${selectedParcel._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updateForm, events: updatedEvents }),
      });

      await fetchAll();
      showMsg(`Parcel "${selectedParcel.trackingNumber}" updated successfully!`);
      setSelectedParcel(null);
      setUpdateSearch('');
    } catch (err) {
      console.error(err);
      showMsg('Error updating parcel', 'error');
    }
  };

  // ── Delete Parcel from MongoDB ──
  const handleDeleteConfirm = async () => {
    try {
      await fetch(`http://https://yto-express.onrender.com/api/parcels/${deleteConfirm._id}`, {
        method: 'DELETE',
      });
      await fetchAll();
      showMsg(`Parcel "${deleteConfirm.trackingNumber}" deleted successfully!`);
      setDeleteConfirm(null);
    } catch (err) {
      console.error(err);
      showMsg('Error deleting parcel', 'error');
    }
  };

  const filteredUpdate   = parcels.filter(p =>
    p.trackingNumber?.toLowerCase().includes(updateSearch.toLowerCase()) ||
    p.senderName?.toLowerCase().includes(updateSearch.toLowerCase())
  );
  const filteredDelete   = parcels.filter(p =>
    p.trackingNumber?.toLowerCase().includes(deleteSearch.toLowerCase()) ||
    p.senderName?.toLowerCase().includes(deleteSearch.toLowerCase())
  );
  const filteredRetrieve = parcels.filter(p => {
    const matchSearch =
      p.trackingNumber?.toLowerCase().includes(retrieveSearch.toLowerCase()) ||
      p.senderName?.toLowerCase().includes(retrieveSearch.toLowerCase()) ||
      p.recipientName?.toLowerCase().includes(retrieveSearch.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const tabs = [
    { key: 'add',      icon: '＋', label: 'Add Parcel'      },
    { key: 'update',   icon: '✎',  label: 'Update Parcel'   },
    { key: 'delete',   icon: '✕',  label: 'Delete Parcel'   },
    { key: 'retrieve', icon: '⊙',  label: 'Retrieve Parcel' },
  ];

  const CITIES = ['Manila','Makati','Quezon City','Pasig','BGC','Hagonoy','Bulacan','Caloocan','Marikina','Mandaluyong','Cebu','Davao','Other'];

  return (
    <div className="ppi-main">

      <header className="ppi-header">
        <div>
          <h1 className="ppi-page-title">Process Parcel Information</h1>
          <p className="ppi-page-sub">Add, update, delete, and retrieve parcel records</p>
          <nav className="ppi-breadcrumb">
            <span>Dashboard</span><span className="ppi-bc-sep">/</span>
            <span>Parcel Information Management</span><span className="ppi-bc-sep">/</span>
            <span className="ppi-bc-active">Process Parcel Information</span>
          </nav>
        </div>
      </header>

      {message.text && (
        <div className={`ppi-toast ppi-toast--${message.type}`}>{message.text}</div>
      )}

      {/* Stats Row */}
      <div className="ppi-stats-row">
        {[
          { label: 'Total Parcels', value: parcels.length,                                        icon: 'total'     },
          { label: 'In Transit',    value: parcels.filter(p => p.status === 'in-transit').length,  icon: 'transit'   },
          { label: 'Delivered',     value: parcels.filter(p => p.status === 'delivered').length,   icon: 'delivered' },
          { label: 'Pending',       value: parcels.filter(p => p.status === 'pending').length,     icon: 'pending'   },
        ].map((s, i) => (
          <div key={s.label} className={`ppi-stat-card ${i === 0 ? 'ppi-stat-card--filled' : ''}`}>
            <div className="ppi-stat-card-icon">
              {s.icon === 'total'     && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}
              {s.icon === 'transit'   && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
              {s.icon === 'delivered' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><polyline points="20 6 9 17 4 12"/></svg>}
              {s.icon === 'pending'   && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            </div>
            <div className="ppi-stat-card-body">
              <span className="ppi-stat-card-num">{s.value}</span>
              <span className="ppi-stat-card-lbl">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="ppi-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`ppi-tab ${activeTab === t.key ? 'ppi-tab--active' : ''}`}
            onClick={() => { setActiveTab(t.key); setSelectedParcel(null); }}>
            <span className="ppi-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ppi-content">

        {/* TAB: ADD */}
        {activeTab === 'add' && (
          <div className="ppi-card">
            <div className="ppi-card-head">
              <h2>Add New Parcel</h2>
              <p>Fill in the details below to register a new parcel in MongoDB</p>
            </div>
            <form className="ppi-form" onSubmit={handleAdd}>

              {/* Parcel Details */}
              <div className="ppi-form-section">
                <h3 className="ppi-section-label"><span className="ppi-section-dot"/>Parcel Details</h3>
                <div className="ppi-grid-2">
                  <div className="ppi-field">
                    <label>Tracking Number (Auto-generated)</label>
                    <input type="text" value={addForm.trackingNumber} readOnly
                      style={{ background:'#f5f0fc', fontFamily:'monospace', fontWeight:600, color:'#6b21a8' }}/>
                  </div>
                  <div className="ppi-field">
                    <label>Weight (kg) *</label>
                    <input type="text" placeholder="e.g. 2.5" value={addForm.weight}
                      onChange={e => setAddForm({...addForm, weight: e.target.value})} required />
                  </div>
                  <div className="ppi-field">
                    <label>Dimensions</label>
                    <input type="text" placeholder="e.g. 30x20x10cm" value={addForm.dimensions}
                      onChange={e => setAddForm({...addForm, dimensions: e.target.value})} />
                  </div>
                  <div className="ppi-field">
                    <label>Content Description</label>
                    <input type="text" placeholder="e.g. Electronics, Clothing…" value={addForm.content}
                      onChange={e => setAddForm({...addForm, content: e.target.value})} />
                  </div>
                  <div className="ppi-field">
                    <label>Service Type</label>
                    <select value={addForm.serviceType} onChange={e => setAddForm({...addForm, serviceType: e.target.value})}>
                      <option value="standard">Standard Delivery</option>
                      <option value="express">Express Delivery</option>
                      <option value="overnight">Overnight Delivery</option>
                      <option value="international">International</option>
                    </select>
                  </div>
                  <div className="ppi-field">
                    <label>Shipping Cost (₱)</label>
                    <input type="number" placeholder="0.00" step="0.01" value={addForm.shippingCost}
                      onChange={e => setAddForm({...addForm, shippingCost: e.target.value})} />
                  </div>
                  <div className="ppi-field">
                    <label>Origin City</label>
                    <select value={addForm.origin} onChange={e => setAddForm({...addForm, origin: e.target.value})}>
                      <option value="">— Select origin —</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="ppi-field">
                    <label>Destination City *</label>
                    <select value={addForm.destination} onChange={e => setAddForm({...addForm, destination: e.target.value})} required>
                      <option value="">— Select destination —</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Assign Rider & Seller */}
              <div className="ppi-form-section">
                <h3 className="ppi-section-label"><span className="ppi-section-dot"/>Assignment</h3>
                <div className="ppi-grid-2">
                  <div className="ppi-field">
                    <label>Assign Rider (Optional)</label>
                    <select value={addForm.riderId} onChange={e => setAddForm({...addForm, riderId: e.target.value})}>
                      <option value="">— Unassigned —</option>
                      {riders.map(r => (
                        <option key={r._id} value={r.registrationId || r._id}>
                          {r.riderName} · {r.vehicleType} · {r.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ppi-field">
                    <label>Assign Seller (Optional)</label>
                    <select value={addForm.sellerId} onChange={e => setAddForm({...addForm, sellerId: e.target.value})}>
                      <option value="">— Unassigned —</option>
                      {sellers.map(s => (
                        <option key={s._id} value={s.registrationId || s._id}>
                          {s.fullName} · {s.city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sender */}
              <div className="ppi-form-section">
                <h3 className="ppi-section-label"><span className="ppi-section-dot"/>Sender Information</h3>
                <div className="ppi-grid-2">
                  <div className="ppi-field">
                    <label>Sender Name *</label>
                    <input type="text" placeholder="Full name" value={addForm.senderName}
                      onChange={e => setAddForm({...addForm, senderName: e.target.value})} required />
                  </div>
                  <div className="ppi-field">
                    <label>Sender Phone</label>
                    <input type="tel" placeholder="+63 917 000 0000" value={addForm.senderPhone}
                      onChange={e => setAddForm({...addForm, senderPhone: e.target.value})} />
                  </div>
                </div>
              </div>

              {/* Recipient */}
              <div className="ppi-form-section">
                <h3 className="ppi-section-label"><span className="ppi-section-dot"/>Recipient Information</h3>
                <div className="ppi-grid-2">
                  <div className="ppi-field">
                    <label>Recipient Name *</label>
                    <input type="text" placeholder="Full name" value={addForm.recipientName}
                      onChange={e => setAddForm({...addForm, recipientName: e.target.value})} required />
                  </div>
                  <div className="ppi-field">
                    <label>Recipient Phone</label>
                    <input type="tel" placeholder="+63 917 000 0000" value={addForm.recipientPhone}
                      onChange={e => setAddForm({...addForm, recipientPhone: e.target.value})} />
                  </div>
                  <div className="ppi-field ppi-field--full">
                    <label>Delivery Address *</label>
                    <input type="text" placeholder="Full delivery address" value={addForm.recipientAddress}
                      onChange={e => setAddForm({...addForm, recipientAddress: e.target.value})} required />
                  </div>
                </div>
              </div>

              <div className="ppi-form-actions">
                <button type="submit" className="ppi-btn ppi-btn--primary">Add Parcel to Database</button>
                <button type="button" className="ppi-btn ppi-btn--ghost"
                  onClick={() => setAddForm({ ...emptyAddForm, trackingNumber: generateTrackingNumber() })}>
                  Clear Form
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB: UPDATE */}
        {activeTab === 'update' && (
          <div className="ppi-split">
            <div className="ppi-card">
              <div className="ppi-card-head">
                <h2>Select Parcel</h2>
                <p>Search and click a parcel to edit it</p>
              </div>
              <div className="ppi-search-bar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search by tracking number or sender…" value={updateSearch}
                  onChange={e => setUpdateSearch(e.target.value)} />
              </div>
              <div className="ppi-parcel-list">
                {loading && <p className="ppi-empty">Loading parcels...</p>}
                {!loading && filteredUpdate.length === 0 && <p className="ppi-empty">No parcels found.</p>}
                {filteredUpdate.map(p => (
                  <div key={p._id}
                    className={`ppi-parcel-row ${selectedParcel?._id === p._id ? 'ppi-parcel-row--active' : ''}`}
                    onClick={() => handleSelectForUpdate(p)}>
                    <div className="ppi-parcel-row-info">
                      <span className="ppi-parcel-id">{p.trackingNumber}</span>
                      <span className="ppi-parcel-route">{p.senderName} → {p.recipientName}</span>
                      <span className="ppi-parcel-meta">{p.weight}kg · {p.content || 'N/A'} · {p.destination || '—'}</span>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            </div>

            {selectedParcel ? (
              <div className="ppi-card">
                <div className="ppi-card-head">
                  <h2>Update {selectedParcel.trackingNumber}</h2>
                  <p>{selectedParcel.senderName} → {selectedParcel.recipientName}</p>
                </div>
                <div className="ppi-preview-strip">
                  {[['Tracking', selectedParcel.trackingNumber], ['Weight', selectedParcel.weight+'kg'], ['Service', selectedParcel.serviceType], ['Destination', selectedParcel.destination || '—']].map(([l, v]) => (
                    <div key={l} className="ppi-preview-item"><span>{l}</span><strong>{v}</strong></div>
                  ))}
                </div>
                <form className="ppi-form" onSubmit={handleUpdate}>
                  <div className="ppi-field">
                    <label>Status</label>
                    <select value={updateForm.status} onChange={e => setUpdateForm({...updateForm, status: e.target.value})}>
                      <option value="pending">Pending</option>
                      <option value="in-transit">In Transit</option>
                      <option value="delivered">Delivered</option>
                      <option value="returned">Returned</option>
                      <option value="failed">Delivery Failed</option>
                    </select>
                  </div>
                  <div className="ppi-field">
                    <label>Assign Rider</label>
                    <select value={updateForm.riderId || selectedParcel.riderId || ''} onChange={e => setUpdateForm({...updateForm, riderId: e.target.value})}>
                      <option value="">— Unassigned —</option>
                      {riders.map(r => (
                        <option key={r._id} value={r.registrationId || r._id}>
                          {r.riderName} · {r.vehicleType} · {r.city}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ppi-field">
                    <label>Current Location</label>
                    <input type="text" placeholder="e.g. Distribution Center" value={updateForm.location}
                      onChange={e => setUpdateForm({...updateForm, location: e.target.value})} />
                  </div>
                  <div className="ppi-field">
                    <label>Notes</label>
                    <textarea placeholder="Additional notes…" rows="3" value={updateForm.notes}
                      onChange={e => setUpdateForm({...updateForm, notes: e.target.value})} />
                  </div>
                  <div className="ppi-form-actions">
                    <button type="submit" className="ppi-btn ppi-btn--primary">Save Changes</button>
                    <button type="button" className="ppi-btn ppi-btn--ghost" onClick={() => setSelectedParcel(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="ppi-card ppi-card--empty">
                <div className="ppi-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#390955" strokeWidth="1.5" width="48" height="48"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  <p>Select a parcel from the list to update its status and location.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: DELETE */}
        {activeTab === 'delete' && (
          <div className="ppi-card">
            <div className="ppi-card-head">
              <h2>Delete Parcel</h2>
              <p>Search for a parcel and remove it permanently from MongoDB</p>
            </div>
            <div className="ppi-search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Search by tracking number or sender…" value={deleteSearch}
                onChange={e => setDeleteSearch(e.target.value)} />
            </div>
            <div className="ppi-delete-list">
              {loading && <p className="ppi-empty">Loading parcels...</p>}
              {!loading && filteredDelete.length === 0 && <p className="ppi-empty">No parcels found.</p>}
              {filteredDelete.map(p => (
                <div key={p._id} className="ppi-delete-row">
                  <div className="ppi-delete-row-left">
                    <span className="ppi-parcel-id">{p.trackingNumber}</span>
                    <div className="ppi-delete-meta">
                      <span>{p.senderName} → {p.recipientName}</span>
                      <span>{p.weight}kg · {p.destination || '—'}</span>
                    </div>
                  </div>
                  <div className="ppi-delete-row-right">
                    <StatusBadge status={p.status} />
                    <button className="ppi-btn ppi-btn--danger" onClick={() => setDeleteConfirm(p)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: RETRIEVE */}
        {activeTab === 'retrieve' && (
          <div className="ppi-card">
            <div className="ppi-card-head">
              <h2>Retrieve Parcel Information</h2>
              <p>Search and filter all parcel records from MongoDB</p>
            </div>
            <div className="ppi-retrieve-filters">
              <div className="ppi-search-bar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" placeholder="Search by tracking number, sender or recipient…" value={retrieveSearch}
                  onChange={e => setRetrieveSearch(e.target.value)} />
              </div>
              <select className="ppi-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in-transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="returned">Returned</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            {loading ? (
              <p style={{ textAlign:'center', padding:32, color:'#a890c0', fontWeight:600 }}>Loading from database...</p>
            ) : (
              <div className="ppi-table-wrap">
                <table className="ppi-table">
                  <thead>
                    <tr>
                      {['Tracking No.','Sender','Recipient','Weight','Destination','Service','Status','Rider','Action'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRetrieve.length === 0 ? (
                      <tr><td colSpan="9" className="ppi-table-empty">No parcels match your search.</td></tr>
                    ) : filteredRetrieve.map(p => {
                      const assignedRider = riders.find(r => r.registrationId === p.riderId || r._id === p.riderId);
                      return (
                        <tr key={p._id}>
                          <td className="ppi-td-id" style={{ fontFamily:'monospace', fontSize:11 }}>{p.trackingNumber}</td>
                          <td>{p.senderName}</td>
                          <td>{p.recipientName}</td>
                          <td>{p.weight}kg</td>
                          <td>{p.destination || '—'}</td>
                          <td style={{ textTransform:'capitalize' }}>{p.serviceType}</td>
                          <td><StatusBadge status={p.status}/></td>
                          <td style={{ fontSize:11, color: assignedRider ? '#390955' : '#bbb', fontWeight: assignedRider ? 600 : 400 }}>
                            {assignedRider ? `🛵 ${assignedRider.riderName}` : 'Unassigned'}
                          </td>
                          <td><button className="ppi-btn-sm" onClick={() => setViewParcel(p)}>View</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="ppi-table-count">Showing {filteredRetrieve.length} of {parcels.length} parcels</p>
          </div>
        )}
      </div>

      {/* Modal: View Parcel */}
      {viewParcel && (
        <div className="ppi-overlay" onClick={() => setViewParcel(null)}>
          <div className="ppi-modal" onClick={e => e.stopPropagation()}>
            <div className="ppi-modal-head">
              <div><h3>{viewParcel.trackingNumber}</h3><StatusBadge status={viewParcel.status} /></div>
              <button className="ppi-modal-close" onClick={() => setViewParcel(null)}>✕</button>
            </div>
            <div className="ppi-modal-body">
              {[
                ['Tracking Number',   viewParcel.trackingNumber],
                ['Sender',            viewParcel.senderName],
                ['Sender Phone',      viewParcel.senderPhone],
                ['Recipient',         viewParcel.recipientName],
                ['Recipient Phone',   viewParcel.recipientPhone],
                ['Delivery Address',  viewParcel.recipientAddress],
                ['Origin',            viewParcel.origin || '—'],
                ['Destination',       viewParcel.destination || '—'],
                ['Weight',            viewParcel.weight + ' kg'],
                ['Dimensions',        viewParcel.dimensions || '—'],
                ['Content',           viewParcel.content || '—'],
                ['Service Type',      viewParcel.serviceType],
                ['Shipping Cost',     viewParcel.shippingCost ? '₱' + viewParcel.shippingCost : '—'],
                ['Assigned Rider',    riders.find(r => r.registrationId === viewParcel.riderId || r._id === viewParcel.riderId)?.riderName || 'Unassigned'],
                ['Assigned Seller',   sellers.find(s => s.registrationId === viewParcel.sellerId || s._id === viewParcel.sellerId)?.fullName || 'Unassigned'],
                ['Current Location',  viewParcel.location || '—'],
                ['Status',            viewParcel.status],
                ['Notes',             viewParcel.notes || '—'],
              ].map(([l, v]) => (
                <div key={l} className="ppi-modal-row">
                  <span>{l}</span><strong>{v}</strong>
                </div>
              ))}
            </div>
            {/* Tracking Events */}
            {viewParcel.events && viewParcel.events.length > 0 && (
              <div style={{ padding:'0 24px 16px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#390955', textTransform:'uppercase', marginBottom:8 }}>Tracking Events</div>
                {viewParcel.events.map((ev, i) => (
                  <div key={i} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid #f0eaf8', fontSize:12 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#f37021', marginTop:4, flexShrink:0 }}/>
                    <div>
                      <div style={{ fontWeight:700, color:'#1a0a2e' }}>{ev.event}</div>
                      <div style={{ color:'#9b82b2', marginTop:2 }}>{ev.time} · {ev.location}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="ppi-modal-foot">
              <button className="ppi-btn ppi-btn--ghost" onClick={() => setViewParcel(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirm */}
      {deleteConfirm && (
        <div className="ppi-overlay">
          <div className="ppi-modal ppi-modal--sm">
            <div className="ppi-modal-head"><h3>Confirm Deletion</h3></div>
            <div className="ppi-modal-body">
              <p style={{ fontSize:'14px', lineHeight:1.6 }}>
                Are you sure you want to permanently delete parcel <strong>{deleteConfirm.trackingNumber}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="ppi-modal-foot">
              <button className="ppi-btn ppi-btn--ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="ppi-btn ppi-btn--danger" onClick={handleDeleteConfirm}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}