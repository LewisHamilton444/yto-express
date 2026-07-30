'use client';
import React, { useState, useEffect } from 'react';
import LiveRiderMap from './LiveRiderMap';
import { CITY_COORDS } from './luzonCityCoords';

const vehicleIcon = (v) => {
  const t = String(v).toLowerCase();
  if (t.includes('e-bike')) return '⚡';
  if (t.includes('bicycle')) return '🚲';
  return '🛵';
};

export default function MonitorGeofenceBoundary() {
  const [riders,        setRiders]        = useState([]);
  const [parcels,       setParcels]       = useState([]);
  const [alertFilter,   setAlertFilter]   = useState('All');
  const [lastUpdated,   setLastUpdated]   = useState('');

  const fetchData = async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        fetch('http://https://yto-express.onrender.com/api/riders'),
        fetch('http://https://yto-express.onrender.com/api/parcels'),
      ]);
      const [rData, pData] = await Promise.all([rRes.json(), pRes.json()]);

      // Only active riders
      const activeRiders = rData
        .filter(r => {
          const s = (r.status||'active').toLowerCase();
          return s!=='archived' && s!=='inactive';
        })
        .map((r, i) => {
          const coords = CITY_COORDS[r.city];
          return {
            id:       r.registrationId || r._id,
            _id:      r._id,
            name:     r.riderName || 'Unknown',
            phone:    r.phone || '',
            vehicle:  r.vehicleType || 'Motorcycle',
            status:   r.status || 'Active',
            city:     r.city || '',
            province: r.province || '',
            barangay: r.barangay || '',
            // If city found in coords, spread slightly so riders in same city don't overlap
            lat: coords ? coords.lat + (i * 0.002) : 14.5995 + (i * 0.008),
            lng: coords ? coords.lng + (i * 0.002) : 120.9842 + (i * 0.006),
            battery: Math.floor(40+Math.random()*60),
            speed:   `${Math.floor(15+Math.random()*25)} km/h`,
          };
        });

      // Only active parcels
      const activeParcels = pData
        .filter(p => p.status!=='delivered'&&p.status!=='returned'&&p.status!=='failed')
        .map((p, i) => {
          const destCoords = CITY_COORDS[p.destination];
          const origCoords = CITY_COORDS[p.origin];
          return {
            ...p,
            lat: destCoords ? destCoords.lat+(i*0.002) : origCoords ? origCoords.lat+(i*0.002) : 14.58+(i*0.006),
            lng: destCoords ? destCoords.lng+(i*0.002) : origCoords ? origCoords.lng+(i*0.002) : 121.01+(i*0.006),
          };
        });

      setRiders(activeRiders);
      setParcels(activeParcels);
    } catch(err) {
      console.error('Error fetching:', err);
      setRiders([]); setParcels([]);
    } finally {
      setLastUpdated(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const alertTypes=['All','Entry','Exit','Breach','Overspeed'];
  const alerts = riders.slice(0,5).map((r,i)=>({
    id:i+1, type:['Entry','Exit','Entry','Breach','Overspeed'][i%5],
    zone:`${r.city||'Unknown'}, ${r.province||'Luzon'}`,
    time:`${i*3+2} min ago`, rider:r.name,
    severity:['info','warning','info','danger','warning'][i%5],
  }));
  const filteredAlerts = alertFilter==='All' ? alerts : alerts.filter(a=>a.type===alertFilter);
  const sevColor = {info:'#390955',warning:'#f37021',danger:'#ef4444'};
  const card = {background:'white',borderRadius:14,border:'1px solid rgba(57,9,85,0.09)',boxShadow:'0 2px 16px rgba(57,9,85,0.06)',overflow:'hidden'};

  return (
    <div style={{flex:1,background:'#f4f1fb',overflowY:'auto',overflowX:'hidden',fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}} @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1}} .leaflet-popup-content-wrapper{border-radius:10px!important;box-shadow:0 8px 24px rgba(0,0,0,.14)!important;}`}</style>

      {/* Header */}
      <header style={{background:'white',borderBottom:'1px solid rgba(57,9,85,0.09)',padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 2px 12px rgba(57,9,85,0.06)'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:5}}>
            <div style={{width:32,height:32,borderRadius:9,background:'#390955',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="16" height="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <h1 style={{fontSize:20,fontWeight:800,color:'#390955',letterSpacing:-0.5,margin:0}}>Monitor Parcel</h1>
          </div>
          <nav style={{display:'flex',alignItems:'center',gap:6,fontSize:11,paddingLeft:42}}>
            {['Dashboard','GPS-Based Parcel','Monitor Parcel'].map((b,i,arr)=>(
              <React.Fragment key={b}>
                <span style={{color:i===arr.length-1?'#f37021':'#9b82b2',fontWeight:i===arr.length-1?700:400}}>{b}</span>
                {i<arr.length-1&&<span style={{color:'rgba(57,9,85,0.2)'}}>/</span>}
              </React.Fragment>
            ))}
          </nav>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {lastUpdated&&<span style={{fontSize:10,color:'#9b82b2',fontFamily:'monospace'}}>Updated {lastUpdated}</span>}
          <button onClick={fetchData} style={{padding:'5px 12px',background:'white',border:'1.5px solid #e0d5f0',borderRadius:8,fontSize:11,fontWeight:700,color:'#390955',cursor:'pointer'}}>🔄 Refresh</button>
          <span style={{display:'flex',alignItems:'center',gap:4,padding:'5px 12px',background:'rgba(57,9,85,0.08)',borderRadius:8,fontSize:11,fontWeight:700,color:'#390955'}}>📦 {parcels.length} Parcels</span>
          <span style={{display:'flex',alignItems:'center',gap:4,padding:'5px 12px',background:'rgba(34,197,94,0.1)',borderRadius:8,fontSize:11,fontWeight:700,color:'#16a34a'}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',animation:'pulse 1.5s infinite',display:'inline-block'}}/>
            Live · {riders.length} Riders
          </span>
        </div>
      </header>

      <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>

        <LiveRiderMap />

        {/* Geofence Alerts */}
        <div style={card}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(57,9,85,0.07)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(57,9,85,0.02)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:30,height:30,borderRadius:8,background:'#390955',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <span style={{fontSize:14,fontWeight:800,color:'#1a0a2e'}}>Geofence Alerts</span>
            </div>
            <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:20,background:'rgba(239,68,68,0.1)',color:'#dc2626'}}>{alerts.length} Active</span>
          </div>
          <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(57,9,85,0.07)',display:'flex',gap:6,flexWrap:'wrap'}}>
            {alertTypes.map(t=>(
              <button key={t} onClick={()=>setAlertFilter(t)}
                style={{padding:'4px 11px',borderRadius:20,border:`1.5px solid ${alertFilter===t?'#390955':'rgba(57,9,85,0.15)'}`,background:alertFilter===t?'#390955':'white',color:alertFilter===t?'white':'#555',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                {t}
              </button>
            ))}
          </div>
          <div style={{padding:'12px',display:'flex',flexDirection:'column',gap:8,maxHeight:200,overflowY:'auto'}}>
            {filteredAlerts.length===0 ? (
              <div style={{textAlign:'center',padding:24,color:'#bbb',fontSize:13}}>No alerts.</div>
            ) : filteredAlerts.map(a=>(
              <div key={a.id} style={{padding:'11px 13px',background:'#faf8ff',border:'1.5px solid rgba(57,9,85,0.08)',borderLeft:`4px solid ${sevColor[a.severity]}`,borderRadius:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:4,textTransform:'uppercase',
                    background:a.severity==='danger'?'rgba(239,68,68,0.1)':a.severity==='warning'?'rgba(245,158,11,0.1)':'rgba(57,9,85,0.08)',
                    color:a.severity==='danger'?'#dc2626':a.severity==='warning'?'#d97706':'#390955'}}>{a.type}</span>
                  <span style={{fontSize:10,color:'#9b82b2',fontWeight:600}}>{a.time}</span>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:'#1a0a2e',marginBottom:3}}>{a.zone}</div>
                <div style={{fontSize:11,color:'#9b82b2'}}>{a.rider}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Riders Table */}
        <div style={card}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(57,9,85,0.07)',background:'rgba(57,9,85,0.02)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:14,fontWeight:800,color:'#1a0a2e'}}>Active Riders on Map</span>
            <span style={{fontSize:12,color:'#9b82b2'}}>{riders.length} riders showing</span>
          </div>
          {riders.length===0 ? (
            <div style={{padding:24,textAlign:'center',color:'#bbb',fontSize:13}}>No active riders. Register or restore riders first.</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr>{['Rider ID','Name','Vehicle','Province','City','Barangay','Assigned Parcel'].map(h=>(
                    <th key={h} style={{padding:'12px 16px',textAlign:'left',fontWeight:700,color:'white',fontSize:11,textTransform:'uppercase',letterSpacing:0.5,background:'#390955'}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {riders.map((r,i)=>{
                    const rParcel=parcels.find(p=>p.riderId===r.id||p.riderId===r._id);
                    return (
                      <tr key={r.id}
                        style={{background:i%2===0?'white':'rgba(57,9,85,0.015)'}}>
                        <td style={{padding:'12px 16px',fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#f37021'}}>{r.id}</td>
                        <td style={{padding:'12px 16px',fontWeight:700,color:'#1a0a2e'}}>
                          <span style={{marginRight:6}}>{vehicleIcon(r.vehicle)}</span>{r.name}
                        </td>
                        <td style={{padding:'12px 16px',color:'#555'}}>{r.vehicle}</td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{fontSize:11,fontWeight:600,color:'#390955',background:'#f0eaf8',padding:'2px 8px',borderRadius:6}}>{r.province||'—'}</span>
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{fontSize:11,fontWeight:600,color:'#6b21a8',background:'#f5f0fc',padding:'2px 8px',borderRadius:6}}>{r.city||'—'}</span>
                        </td>
                        <td style={{padding:'12px 16px',fontSize:11,color:'#888'}}>{r.barangay||'—'}</td>
                        <td style={{padding:'12px 16px',fontSize:11,color:rParcel?'#f37021':'#bbb',fontWeight:rParcel?600:400}}>
                          {rParcel?`📦 ${rParcel.trackingNumber}`:'Unassigned'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}