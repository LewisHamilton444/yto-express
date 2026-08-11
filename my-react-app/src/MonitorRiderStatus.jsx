'use client';
import React, { useState, useEffect, useRef } from 'react';
import { normalizeRider, mockRiders, RIDER_STATUS } from './sellerRiderData';

const vehicleIcon = (v) => {
  const type = String(v).toLowerCase();
  if (type.includes('bike') || type.includes('e-bike')) return '⚡';
  if (type.includes('bicycle')) return '🚲';
  return '🛵';
};

const CITY_COORDS = {
  Manila:{lat:14.5995,lng:120.9842}, 'Quezon City':{lat:14.6760,lng:121.0437}, Makati:{lat:14.5547,lng:121.0244},
  Pasig:{lat:14.5764,lng:121.0851}, Taguig:{lat:14.5243,lng:121.0792}, Mandaluyong:{lat:14.5794,lng:121.0359},
  Marikina:{lat:14.6507,lng:121.1029}, Caloocan:{lat:14.6494,lng:120.9673}, Malabon:{lat:14.6628,lng:120.9575},
  Navotas:{lat:14.6667,lng:120.9417}, Valenzuela:{lat:14.7011,lng:120.9830}, 'Las Piñas':{lat:14.4453,lng:120.9829},
  Parañaque:{lat:14.4793,lng:121.0198}, Muntinlupa:{lat:14.4081,lng:121.0415}, Pasay:{lat:14.5378,lng:120.9938},
  'San Juan':{lat:14.6019,lng:121.0355}, BGC:{lat:14.5409,lng:121.0503}, Pateros:{lat:14.5436,lng:121.0683},
  Hagonoy:{lat:14.8340,lng:120.7310}, Malolos:{lat:14.8430,lng:120.8110}, Meycauayan:{lat:14.7350,lng:120.9580},
  Marilao:{lat:14.7580,lng:120.9490}, Balagtas:{lat:14.8140,lng:120.9090}, Bocaue:{lat:14.7970,lng:120.9290},
  Pulilan:{lat:14.8990,lng:120.8490}, Calumpit:{lat:14.9150,lng:120.7650}, Guiguinto:{lat:14.8290,lng:120.8790},
  Bulacan:{lat:14.7942,lng:120.8800}, Bacoor:{lat:14.4624,lng:120.9645}, Imus:{lat:14.4297,lng:120.9367},
  Dasmarinas:{lat:14.3294,lng:120.9367}, Kawit:{lat:14.4353,lng:120.9014}, 'General Trias':{lat:14.3867,lng:120.8817},
  'Cavite City':{lat:14.4824,lng:120.8960}, 'San Pedro':{lat:14.3592,lng:121.0128}, Biñan:{lat:14.3406,lng:121.0792},
  'Santa Rosa':{lat:14.3122,lng:121.1114}, Cabuyao:{lat:14.2758,lng:121.1244}, Calamba:{lat:14.2117,lng:121.1653},
  'Los Baños':{lat:14.1667,lng:121.2333}, Antipolo:{lat:14.5864,lng:121.1761}, Cainta:{lat:14.5783,lng:121.1228},
  Taytay:{lat:14.5514,lng:121.1322}, Angono:{lat:14.5244,lng:121.1536}, Binangonan:{lat:14.4672,lng:121.1975},
  Angeles:{lat:15.1450,lng:120.5888}, 'San Fernando':{lat:15.0289,lng:120.6900}, Mabalacat:{lat:15.2167,lng:120.5667},
  'Batangas City':{lat:13.7565,lng:121.0583}, Lipa:{lat:13.9411,lng:121.1628}, Tanauan:{lat:14.0844,lng:121.1503},
  Cabanatuan:{lat:15.4864,lng:120.9670}, Gapan:{lat:15.3072,lng:120.9458}, Dagupan:{lat:16.0433,lng:120.3333},
  Urdaneta:{lat:15.9761,lng:120.5711}, Baguio:{lat:16.4023,lng:120.5960}, 'Tarlac City':{lat:15.4755,lng:120.5963},
  Olongapo:{lat:14.8285,lng:120.2824}, Balanga:{lat:14.6760,lng:120.5360}, Tuguegarao:{lat:17.6133,lng:121.7270},
  Cauayan:{lat:16.9333,lng:121.7667}, Santiago:{lat:16.6875,lng:121.5500}, Ilagan:{lat:17.1489,lng:121.8894},
  Bayombong:{lat:16.4833,lng:121.1500}, 'Davao City':{lat:7.0731,lng:125.6128},
};

function MapView({ lat, lng, vehicle, uniqueId }) {
  const containerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const animRef = useRef(null);
  const progRef = useRef(Math.random()*0.01);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!document.getElementById('leaflet-cdn-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-cdn-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }

    const initLeaflet = () => {
      if (!window.L || !containerRef.current || mapInstanceRef.current) return;
      const L = window.L;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false
      }).setView([lat, lng], 14);
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      const customIcon = L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;background:#f37021;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><div style="transform:rotate(45deg);font-size:14px;">${vehicleIcon(vehicle)}</div></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });
      markerRef.current = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      // ── Live movement animation — simulates rider moving ──
      let last = null;
      const animate = (ts) => {
        if (!last) last = ts;
        const dt = (ts - last) / 1000;
        last = ts;
        progRef.current = (progRef.current + 0.00008 * dt) % 0.01;
        const drift = progRef.current;
        if (markerRef.current) {
          markerRef.current.setLatLng([lat + drift, lng + drift * 0.5]);
        }
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    };

    if (window.L) {
      initLeaflet();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = initLeaflet;
      document.head.appendChild(script);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng, vehicle]);

  return <div ref={containerRef} id={`map-${uniqueId}`} style={{ width: '100%', height: '150px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '12px' }} />;
}

export default function MonitorRiderStatus() {
  const [activeTab, setActiveTab] = useState('gps-coords');
  const [riders, setRiders] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [geofences, setGeofences] = useState([
    { id: 'G001', name: 'Makati District',  center: '14.5547, 121.0244', radius: '2 km',   status: 'Active'   },
    { id: 'G002', name: 'Quezon City Hub',  center: '14.6760, 121.0437', radius: '1.5 km', status: 'Active'   },
    { id: 'G003', name: 'BGC Zone',         center: '14.5409, 121.0503', radius: '1.8 km', status: 'Inactive' },
    { id: 'G004', name: 'Pasig Depot',      center: '14.5764, 121.0851', radius: '1 km',   status: 'Active'   },
    { id: 'G005', name: 'Hagonoy Bulacan',  center: '14.8340, 120.7310', radius: '1.2 km', status: 'Active'   },
  ]);

  const attachLiveGps = (normalizedRiders) => normalizedRiders.map((r, index) => {
    const coords = CITY_COORDS[r.location.city];
    return {
      ...r,
      liveGps: {
        latitude:  coords ? coords.lat + (index * 0.0015) : 14.5995 + (index * 0.008),
        longitude: coords ? coords.lng + (index * 0.0015) : 120.9842 + (index * 0.006),
        city: r.location.city || 'Unknown',
        isOnline: true,
        isMoving: true,
      },
    };
  });

  const fetchRiders = async () => {
    try {
      const response = await fetch('https://yto-express.onrender.com/api/riders');
      const data = await response.json();

      const normalized  = data.map(normalizeRider);
      // ── ONLY show active riders on the live map, hide archived/pending ──
      const activeOnes  = normalized.filter(r => r.status === RIDER_STATUS.ACTIVE);
      const archivedNum = normalized.length - activeOnes.length;

      setRiders(attachLiveGps(activeOnes));
      setArchivedCount(archivedNum);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching riders:', err);
      setRiders(attachLiveGps(mockRiders.filter(r => r.status === RIDER_STATUS.ACTIVE)));
      setArchivedCount(mockRiders.length - mockRiders.filter(r => r.status === RIDER_STATUS.ACTIVE).length);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiders();
    // Re-fetch every 15 seconds to stay in sync with archive/restore actions
    const interval = setInterval(fetchRiders, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleGeofence = (id) => {
    setGeofences(p => p.map(g => g.id === id ? { ...g, status: g.status === 'Active' ? 'Inactive' : 'Active' } : g));
  };

  const th = { padding: '13px 16px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, background: '#390955' };
  const td = { padding: '13px 16px', borderBottom: '1px solid #f0eaf8', color: '#1a1a1a', verticalAlign: 'middle' };

  return (
    <div style={{ flex: 1, background: '#f9f7ff', overflowY: 'auto', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}`}</style>

      <header style={{ background: 'white', borderBottom: '1px solid #e0d5f0', padding: '24px 32px 20px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', letterSpacing: -0.5, margin: '0 0 4px 0' }}>Monitor Rider Status</h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Real-time rider tracking and GPS monitoring</p>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {['Dashboard', 'Rider Information Management', 'Monitor Rider Status'].map((b, i, arr) => (
              <React.Fragment key={b}>
                <span style={{ fontSize: 12, color: i === arr.length - 1 ? '#390955' : '#888', fontWeight: i === arr.length - 1 ? 700 : 500 }}>{b}</span>
                {i < arr.length - 1 && <span style={{ fontSize: 12, color: '#d4c8e8' }}>/</span>}
              </React.Fragment>
            ))}
          </nav>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastUpdated && <span style={{ fontSize:10, color:'#9b82b2', fontFamily:'monospace' }}>Updated {lastUpdated}</span>}
          <button onClick={fetchRiders} style={{ padding:'6px 14px', background:'white', border:'1.5px solid #e0d5f0', borderRadius:8, fontSize:11, fontWeight:700, color:'#390955', cursor:'pointer' }}>
            🔄 Refresh
          </button>
          {archivedCount > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', background:'rgba(127,140,141,0.1)', borderRadius:8, fontSize:11, fontWeight:700, color:'#7f8c8d' }}>
              🗄 {archivedCount} Archived (hidden)
            </span>
          )}
          <span style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 12px', background:'rgba(34,197,94,0.1)', borderRadius:8, fontSize:11, fontWeight:700, color:'#16a34a' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', animation:'pulse 1.5s infinite', display:'inline-block' }}/>
            {riders.length} Online
          </span>
        </div>
      </header>

      <div style={{ padding: '24px 32px' }}>

        {/* TABS */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e0d5f0', marginBottom: 20 }}>
          {[
            ['gps-coords', 'GPS Coordinates'],
            ['geofence',   'Geofence Boundary']
          ].map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              style={{ padding: '12px 20px', border: 'none', background: 'none', color: activeTab === k ? '#390955' : '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: activeTab === k ? '3px solid #390955' : '3px solid transparent', marginBottom: -2, fontFamily: 'inherit' }}>
              {l}
            </button>
          ))}
        </div>

        {/* TAB 1: GPS COORDINATES - Only active DB riders */}
        {activeTab === 'gps-coords' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#a890c0', fontWeight: 600 }}>
              Loading riders from database...
            </div>
          ) : riders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#a890c0', fontWeight: 600 }}>
              {archivedCount > 0
                ? `All ${archivedCount} riders are archived. Restore some riders to see them here.`
                : 'No riders registered yet. Register a rider first.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {riders.map((r) => (
                <div key={r.riderId} style={{ background: 'white', border: '1px solid #e0d5f0', borderRadius: '12px', padding: '18px', boxShadow: '0 4px 14px rgba(57,9,85,0.04)', display: 'flex', flexDirection: 'column' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                          {vehicleIcon(r.vehicleType)}
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>{r.fullName}</h4>
                          <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{r.riderId} · {r.vehicleType}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', background: '#e6f9ed', color: '#1e7e34', padding: '3px 8px', borderRadius: '10px', fontWeight: 700, display:'flex', alignItems:'center', gap:4 }}>
                        <span style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', animation:'pulse 1.5s infinite', display:'inline-block' }}/>
                        {r.liveGps.isOnline ? 'Online' : 'Offline'} · {r.liveGps.isMoving ? 'Moving' : 'Idle'}
                      </span>
                    </div>

                    <div style={{ background: '#fcfbfe', border: '1px solid #f0eaf8', borderRadius: '8px', padding: '10px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Rider ID:</span>
                        <span style={{ fontWeight: 600, color: '#390955' }}>{r.riderId}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Vehicle Type:</span>
                        <span style={{ fontWeight: 600 }}>{r.vehicleType}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Phone Number:</span>
                        <span style={{ fontWeight: 600 }}>{r.phone || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>City/Location:</span>
                        <span style={{ fontWeight: 600, color: '#390955' }}>{r.location.city}{r.location.province ? `, ${r.location.province}` : ''}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Latitude:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{Number(r.liveGps.latitude).toFixed(5)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Longitude:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{Number(r.liveGps.longitude).toFixed(5)}</span>
                      </div>
                    </div>

                    <MapView lat={r.liveGps.latitude} lng={r.liveGps.longitude} vehicle={r.vehicleType} uniqueId={r.riderId} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* TAB 2: GEOFENCE BOUNDARY */}
        {activeTab === 'geofence' && (
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e0d5f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Geofence Region', 'Center Coordinate Pins', 'Radius Boundary', 'Operational Status', 'Toggle Control'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {geofences.map((g, i) => (
                  <tr key={g.id} style={i % 2 === 0 ? {} : { background: 'rgba(57,9,85,0.015)' }}>
                    <td style={{ ...td, fontWeight: 700, color: '#390955' }}>📍 {g.name}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{g.center}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{g.radius}</td>
                    <td style={td}>
                      <span style={{ padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: g.status === 'Active' ? '#e6f9ed' : '#fff0f0', color: g.status === 'Active' ? '#1e7e34' : '#b91c1c' }}>
                        {g.status}
                      </span>
                    </td>
                    <td style={td}>
                      <input type="checkbox" checked={g.status === 'Active'} onChange={() => handleToggleGeofence(g.id)} style={{ cursor: 'pointer' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
