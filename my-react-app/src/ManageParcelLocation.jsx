'use client';
import React, { useState, useEffect } from 'react';
import './ManageParcelLocation.css';

const now = () => new Date().toISOString().slice(0,16).replace('T',' ');
const nowFull = () => new Date().toUTCString().replace(' GMT','  UTC');

const StatusBadge = ({ val }) => {
  const v = val?.toLowerCase() || '';
  const cfg = {
    active:       { bg:'#f0eaf8', color:'#390955', border:'#ddd0f8' },
    delivered:    { bg:'#390955', color:'white',   border:'#390955' },
    'in transit': { bg:'#fff4ec', color:'#f37021', border:'#f9d4b6' },
    inside:       { bg:'#390955', color:'white',   border:'#390955' },
    outside:      { bg:'#fff4ec', color:'#f37021', border:'#f9d4b6' },
  };
  const c = cfg[v] || { bg:'#f5f5f5', color:'#888', border:'#e0e0e0' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 11px', borderRadius:20, fontSize:11, fontWeight:700, background:c.bg, color:c.color, border:`1.5px solid ${c.border}` }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:c.color, flexShrink:0 }}/>
      {val}
    </span>
  );
};

const TypePill = ({ val }) => (
  <span style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:600, background:'#f5f0fc', color:'#6b21a8', border:'1px solid #e9d5ff' }}>{val}</span>
);

const Ico = {
  Pin:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
  Edit:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
  Refresh: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  Search:  () => <svg viewBox="0 0 24 24" fill="none" stroke="#9b82b2" strokeWidth="2" width="13" height="13"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Map:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
};

function EditModal({ row, onSave, onClose }) {
  const [lat,  setLat]  = useState(row.lat);
  const [lng,  setLng]  = useState(row.lng);
  const [loc,  setLoc]  = useState(row.location);
  const [type, setType] = useState(row.type);
  const [stat, setStat] = useState(row.status);
  const [geo,  setGeo]  = useState(row.geofence);
  const valid = lat && lng && loc && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));

  return (
    <div style={{ position:'fixed', top:0, left:0, width:'100vw', height:'100vh', backgroundColor:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)', zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div style={{ maxWidth:'520px', width:'90%', backgroundColor:'#fff', borderRadius:'16px', padding:'24px', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e=>e.stopPropagation()}>
        <h3 style={{ color:'#390955', margin:'0 0 4px 0', fontSize:'18px', fontWeight:700 }}>Edit Location Parameters</h3>
        <p style={{ fontFamily:'monospace', margin:'0 0 20px 0', fontSize:'13px', color:'#f37021', fontWeight:600 }}>{row.parcelId}</p>
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="process-parcel-location-form-group">
              <label>Latitude</label>
              <input value={lat} onChange={e=>setLat(e.target.value)} placeholder="e.g. 14.5995"/>
            </div>
            <div className="process-parcel-location-form-group">
              <label>Longitude</label>
              <input value={lng} onChange={e=>setLng(e.target.value)} placeholder="e.g. 120.9842"/>
            </div>
          </div>
          <div className="process-parcel-location-form-group">
            <label>Location Name</label>
            <input value={loc} onChange={e=>setLoc(e.target.value)}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="process-parcel-location-form-group">
              <label>Location Type</label>
              <select value={type} onChange={e=>setType(e.target.value)}>
                {['Warehouse','Distribution','Branch','Depot','Delivery Point'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="process-parcel-location-form-group">
              <label>Status</label>
              <select value={stat} onChange={e=>setStat(e.target.value)}>
                {['Active','In Transit','Delivered'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="process-parcel-location-form-group">
            <label>Geofence Grid Bound</label>
            <select value={geo} onChange={e=>setGeo(e.target.value)}>
              <option>Inside</option><option>Outside</option>
            </select>
          </div>
        </div>
        {!valid && <div style={{ fontSize:12, color:'#9b1c1c', marginTop:12, fontWeight:600 }}>⚠ Coordinates must be valid numeric values.</div>}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginTop:'24px' }}>
          <button className="process-parcel-location-btn process-parcel-location-btn--secondary" style={{ margin:0 }} onClick={onClose}>Cancel</button>
          <button className="process-parcel-location-btn process-parcel-location-btn--primary" style={{ margin:0, opacity:valid?1:0.5 }} onClick={()=>valid && onSave({ lat, lng, location:loc, type, status:stat, geofence:geo })}>
            <Ico.Check/> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProcessParcelLocation() {
  const [locations,      setLocations]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState('parcel');
  const [editTarget,     setEditTarget]     = useState(null);
  const [search,         setSearch]         = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage,   setErrorMessage]   = useState('');
  const [clock,          setClock]          = useState(nowFull());
  const [gpsQuery,       setGpsQuery]       = useState('');
  const [gpsResult,      setGpsResult]      = useState(null);
  const [gpsError,       setGpsError]       = useState('');
  const [gpsLastRefresh, setGpsLastRefresh] = useState(nowFull());

  // Form states
  const [parcelId, setParcelId] = useState('');
  const [lat,      setLat]      = useState('');
  const [lng,      setLng]      = useState('');
  const [locName,  setLocName]  = useState('');
  const [locType,  setLocType]  = useState('Warehouse');
  const [notes,    setNotes]    = useState('');

  useEffect(() => {
    const t = setInterval(() => setClock(nowFull()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/parcel-locations');
      const data = await res.json();
      setLocations(data);
    } catch (err) {
      console.error('Error fetching locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg, type = 'success') => {
    if (type === 'success') { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(''), 3000); }
    else { setErrorMessage(msg); setTimeout(() => setErrorMessage(''), 3000); }
  };

  const resetForm = () => {
    setParcelId(''); setLat(''); setLng('');
    setLocName(''); setLocType('Warehouse'); setNotes('');
  };

  const handleSaveEdit = async (updates) => {
    try {
      await fetch(`http://localhost:3001/api/parcel-locations/${editTarget._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, updatedAt: now() }),
      });
      await fetchLocations();
      if (gpsResult && gpsResult._id === editTarget._id) {
        setGpsResult(prev => ({ ...prev, ...updates }));
      }
      setEditTarget(null);
      showMessage('Location record modified successfully');
    } catch (err) {
      showMessage('Error updating location', 'error');
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!parcelId.trim() || !lat.trim() || !lng.trim() || !locName.trim()) {
      showMessage('Please fill all required fields.', 'error'); return;
    }
    if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
      showMessage('Latitude and Longitude must be numbers.', 'error'); return;
    }
    if (locations.some(r => r.parcelId === parcelId.trim())) {
      showMessage('This Parcel ID already exists.', 'error'); return;
    }
    try {
      await fetch('http://localhost:3001/api/parcel-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcelId: parcelId.trim(), lat: lat.trim(), lng: lng.trim(), location: locName.trim(), type: locType, status: 'Active', geofence: 'Inside', notes: notes.trim() }),
      });
      await fetchLocations();
      showMessage('New hub location added successfully!');
      resetForm();
      setActiveTab('parcel');
    } catch (err) {
      showMessage('Error saving location', 'error');
    }
  };

  const handleGpsLookup = () => {
    const q = gpsQuery.trim().toUpperCase();
    if (!q) { setGpsError('Please provide a Parcel ID.'); setGpsResult(null); return; }
    const found = locations.find(r => r.parcelId.toUpperCase() === q);
    if (found) { setGpsResult(found); setGpsError(''); }
    else { setGpsResult(null); setGpsError(`No match found for "${gpsQuery}".`); }
  };

  const handleGpsRefresh = () => {
    if (gpsResult) {
      const drift = () => (Math.random() * 0.0002 - 0.0001).toFixed(6);
      setGpsResult(r => ({ ...r,
        lat: (parseFloat(r.lat) + parseFloat(drift())).toFixed(4),
        lng: (parseFloat(r.lng) + parseFloat(drift())).toFixed(4),
      }));
    }
    setGpsLastRefresh(nowFull());
    showMessage('Satellite GPS telemetrics synchronized.');
  };

  const filtered = locations.filter(r =>
    r.parcelId?.toLowerCase().includes(search.toLowerCase()) ||
    r.location?.toLowerCase().includes(search.toLowerCase()) ||
    r.status?.toLowerCase().includes(search.toLowerCase()) ||
    r.type?.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { key:'parcel', label:'Get Parcel Info',  icon: <Ico.Pin/> },
    { key:'add',    label:'Add Location',     icon: <Ico.Plus/> },
    { key:'gps',    label:'GPS Coordinates',  icon: <Ico.Map/> },
  ];

  return (
    <div className="process-parcel-location-main-content">
      <div className="process-parcel-location-container-inner">
        <header className="process-parcel-location-card-header">
          <h1 className="process-parcel-location-h1">Manage Parcel Location</h1>
          <p className="process-parcel-location-subtitle">Track, monitor, map, and process regional parcel positioning logistics</p>
          <nav className="ppl-breadcrumb">
            <span className="ppl-breadcrumb-item">Dashboard</span>
            <span className="ppl-breadcrumb-sep">/</span>
            <span className="ppl-breadcrumb-item">Logistics Manager</span>
            <span className="ppl-breadcrumb-sep">/</span>
            <span className="ppl-breadcrumb-item ppl-breadcrumb-item--active">Manage Parcel Location</span>
          </nav>
        </header>

        {successMessage && <div className="process-parcel-location-message process-parcel-location-message--success">{successMessage}</div>}
        {errorMessage   && <div className="process-parcel-location-message process-parcel-location-message--error">{errorMessage}</div>}

        <div className="process-parcel-location-tab-nav">
          {tabs.map(({ key, icon, label }) => (
            <button key={key} className={`process-parcel-location-tab-btn ${activeTab === key ? 'process-parcel-location-tab-btn--active' : ''}`} onClick={() => setActiveTab(key)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{icon}</svg>
              {label}
            </button>
          ))}
        </div>

        <div className="process-parcel-location-content-area">

          {/* TAB 1: PARCEL LOCATION RECORDS */}
          {activeTab === 'parcel' && (
            <div className="process-parcel-location-section">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', flexWrap:'wrap', gap:12 }}>
                <h2 className="process-parcel-location-section-title" style={{ margin:0 }}>Parcel Location Records</h2>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ position:'relative' }}>
                    <input placeholder="Search parcel, hub, type..." value={search} onChange={e=>setSearch(e.target.value)}
                      style={{ padding:'10px 14px 10px 36px', border:'1px solid #dcd3e8', borderRadius:8, fontSize:13, width:260, background:'white' }}/>
                    <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', opacity:0.6 }}><Ico.Search/></span>
                  </div>
                  <span style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700, background:'#390955', color:'white' }}>{filtered.length} Indexed</span>
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign:'center', padding:48, color:'#a890c0', fontWeight:600 }}>Loading from database...</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign:'center', padding:48, color:'#a890c0', fontWeight:600 }}>No parcel locations yet. Add one first!</div>
              ) : (
                <div style={{ overflowX:'auto', border:'1px solid #e8e2f0', borderRadius:'12px' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', background:'white' }}>
                    <thead>
                      <tr style={{ background:'#390955', color:'white' }}>
                        {['Parcel ID','Location Name','Hub Type','Coordinates','Status','Geofence','Last Update','Actions'].map(h => (
                          <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, i) => (
                        <tr key={row._id} style={{ borderBottom:'1px solid #f3eff7', background:i%2===0?'#ffffff':'#fcfbfe' }}>
                          <td style={{ padding:'14px 16px', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#f37021' }}>{row.parcelId}</td>
                          <td style={{ padding:'14px 16px', fontWeight:700, color:'#390955' }}>{row.location}</td>
                          <td style={{ padding:'14px 16px' }}><TypePill val={row.type}/></td>
                          <td style={{ padding:'14px 16px', fontFamily:'monospace', fontSize:12, color:'#6b21a8', fontWeight:600 }}>{row.lat}, {row.lng}</td>
                          <td style={{ padding:'14px 16px' }}><StatusBadge val={row.status}/></td>
                          <td style={{ padding:'14px 16px' }}><StatusBadge val={row.geofence}/></td>
                          <td style={{ padding:'14px 16px', fontSize:12, color:'#8c7f9d' }}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
                          <td style={{ padding:'14px 16px' }}>
                            <button className="process-parcel-location-btn process-parcel-location-btn--secondary" style={{ padding:'6px 14px', borderRadius:6 }} onClick={()=>setEditTarget(row)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD LOCATION */}
          {activeTab === 'add' && (
            <div className="process-parcel-location-section">
              <h2 className="process-parcel-location-section-title">Add New Parcel Location Node</h2>
              <form className="process-parcel-location-form" onSubmit={handleAddLocation}>
                <div className="process-parcel-location-form-group">
                  <label>Parcel Anchor ID *</label>
                  <input value={parcelId} onChange={e=>setParcelId(e.target.value)} placeholder="e.g. PRC-20240323-007" required/>
                </div>
                <div className="process-parcel-location-form-group">
                  <label>Node Latitude *</label>
                  <input value={lat} onChange={e=>setLat(e.target.value)} placeholder="e.g. 14.5995" required/>
                </div>
                <div className="process-parcel-location-form-group">
                  <label>Node Longitude *</label>
                  <input value={lng} onChange={e=>setLng(e.target.value)} placeholder="e.g. 120.9842" required/>
                </div>
                <div className="process-parcel-location-form-group">
                  <label>Hub Location Station Title *</label>
                  <input value={locName} onChange={e=>setLocName(e.target.value)} placeholder="e.g. Manila Main Warehouse" required/>
                </div>
                <div className="process-parcel-location-form-group">
                  <label>Operational Hub Type</label>
                  <select value={locType} onChange={e=>setLocType(e.target.value)}>
                    {['Warehouse','Distribution','Branch','Depot','Delivery Point'].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="process-parcel-location-form-group" style={{ gridColumn:'span 2' }}>
                  <label>Internal Logistics Route Remarks</label>
                  <textarea className="process-parcel-location-textarea" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add optional routing notes..." rows="3" style={{ padding:'11px 14px', borderRadius:8, border:'1px solid #dcd3e8', fontFamily:'inherit', fontSize:'13px', width:'100%' }}/>
                </div>
                {parcelId && locName && lat && lng && (
                  <div style={{ gridColumn:'span 2', padding:'10px 14px', borderRadius:8, border:'1.5px dashed #dcd3e8', background:'#faf9ff', fontSize:13, color:'#6b21a8', fontFamily:'monospace' }}>
                    Preview: {parcelId} · {locName} · {lat}, {lng} · {locType}
                  </div>
                )}
                <div className="process-parcel-location-form-actions">
                  <button type="submit" className="process-parcel-location-btn process-parcel-location-btn--primary">Add Location Node</button>
                  <button type="button" className="process-parcel-location-btn process-parcel-location-btn--secondary" onClick={resetForm}>Clear Form</button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: GPS LOOKUP */}
          {activeTab === 'gps' && (
            <div className="process-parcel-location-section">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', gap:'12px', flexWrap:'wrap' }}>
                <div>
                  <h2 className="process-parcel-location-section-title" style={{ margin:0 }}>Satellite GPS Telematics Lookup</h2>
                  <p style={{ margin:'4px 0 0 0', fontSize:'12px', color:'#8c7f9d', fontWeight:500 }}>Track and view real-time coordination data arrays</p>
                </div>
                <button onClick={handleGpsRefresh} style={{ display:'inline-flex', alignItems:'center', gap:'6px', background:'white', border:'1.5px solid #390955', color:'#390955', padding:'8px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
                  <Ico.Refresh/> Sync Satellite
                </button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'end', background:'#fbf9fe', padding:'16px', borderRadius:'12px', border:'1px solid #edeaf2', marginBottom:'16px' }}>
                <div className="process-parcel-location-form-group" style={{ gap:'4px' }}>
                  <label style={{ color:'#390955' }}>Target Parcel ID</label>
                  <input placeholder="e.g. PRC-20240215-001" value={gpsQuery} onChange={e=>{ setGpsQuery(e.target.value); setGpsError(''); }} onKeyDown={e=>e.key==='Enter' && handleGpsLookup()}/>
                </div>
                <button className="process-parcel-location-btn process-parcel-location-btn--primary" style={{ padding:'11px 20px' }} onClick={handleGpsLookup}>Track Satellite Path</button>
              </div>

              {locations.length > 0 && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:'20px' }}>
                  <span style={{ fontSize:11, color:'#8c7f9d', fontWeight:700, textTransform:'uppercase' }}>Quick Links:</span>
                  {locations.slice(0,5).map(r=>(
                    <button key={r._id} onClick={()=>{ setGpsQuery(r.parcelId); setGpsResult(r); setGpsError(''); }}
                      style={{ padding:'5px 10px', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid #dcd3e8', background:'white', color:'#390955', fontFamily:'monospace' }}>
                      {r.parcelId}
                    </button>
                  ))}
                </div>
              )}

              {gpsError && <div className="process-parcel-location-message process-parcel-location-message--error" style={{ marginBottom:'20px' }}>⚠ {gpsError}</div>}

              {gpsResult && (
                <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                  <div style={{ background:'#390955', borderRadius:16, overflow:'hidden' }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                      <span style={{ fontSize:12, fontWeight:800, color:'white' }}>🛰️ LIVE GLOBAL POSITIONING — <span style={{ fontFamily:'monospace' }}>{gpsResult.parcelId}</span></span>
                      <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', fontFamily:'monospace' }}>⚡ LINK: {gpsLastRefresh}</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))' }}>
                      {[
                        ['Latitude',  gpsResult.lat,      true ],
                        ['Longitude', gpsResult.lng,      true ],
                        ['Location',  gpsResult.location, false],
                        ['Hub Type',  gpsResult.type,     false],
                      ].map(([l,v,big]) => (
                        <div key={l} style={{ padding:'16px 20px', borderRight:'1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:4 }}>{l}</div>
                          <div style={{ fontSize:big?20:13, fontWeight:800, color:'white', fontFamily:big?'monospace':'inherit' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
                    {[
                      ['Status',   gpsResult.status],
                      ['Geofence', gpsResult.geofence],
                      ['Updated',  gpsResult.updatedAt ? new Date(gpsResult.updatedAt).toLocaleString() : '—'],
                    ].map(([k,v]) => (
                      <div key={k} style={{ background:'white', border:'1px solid #e8e2f0', borderRadius:12, padding:'12px 14px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#8c7f9d', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{k}</div>
                        <div style={{ fontSize:13, fontWeight:800, color:'#390955', fontFamily:'monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <button className="process-parcel-location-btn process-parcel-location-btn--primary" style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 20px' }} onClick={()=>setEditTarget(gpsResult)}>
                      <Ico.Edit/> Edit Position Parameters
                    </button>
                  </div>
                </div>
              )}

              {!gpsResult && !gpsError && (
                <div className="process-parcel-location-empty-state">
                  Enter a Parcel ID above to look up its GPS coordinates.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editTarget && <EditModal row={editTarget} onClose={()=>setEditTarget(null)} onSave={handleSaveEdit}/>}
    </div>
  );
}