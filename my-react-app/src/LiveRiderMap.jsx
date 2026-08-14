'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './leafletLoader';
import { LOGISTICS_HUBS, haversineKm, HUB_STATUS_COLORS } from './hubGeofenceData';
import { CITY_COORDS, LUZON_FALLBACK_COORDS } from './luzonCityCoords';
import { MOCK_LUZON_RIDERS, MOCK_LUZON_PARCELS } from './luzonMockData';
import { useRouteAnimation } from './useRouteAnimation';
import { buildLiveAlerts } from './alertsFeed';

const TILE_LAYERS = {
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri' },
};

// No real traffic-conditions feed exists, so "Traffic" is an illustrative
// congestion layer derived from each rider's cruising speed relative to
// their vehicle type — same honesty-over-fabrication approach used for the
// mock data fallback elsewhere in this app.
function congestionColor(rider) {
  const speed = rider.speedKmh || 30;
  if (speed < 22) return '#ef4444';
  if (speed < 36) return '#f59e0b';
  return '#22c55e';
}

const RIDERS_API  = 'https://yto-express.onrender.com/api/riders';
const PARCELS_API = 'https://yto-express.onrender.com/api/parcels';

const vehicleEmoji = (v) => {
  const t = String(v).toLowerCase();
  if (t.includes('e-bike')) return '⚡';
  if (t.includes('bicycle')) return '🚲';
  if (t.includes('van')) return '🚐';
  return '🛵';
};

// Nearest hub to a point — used as the destination for any real rider, since
// MongoDB rider records don't store a hub assignment or a route directly.
function nearestHub(lat, lng) {
  let best = LOGISTICS_HUBS[0];
  let bestDist = Infinity;
  LOGISTICS_HUBS.forEach(hub => {
    const d = haversineKm(lat, lng, hub.coordinates.lat, hub.coordinates.lng);
    if (d < bestDist) { bestDist = d; best = hub; }
  });
  return best;
}

// A rotated "nose" triangle points the way while the badge + emoji stay
// upright and readable, regardless of heading.
function buildRiderIcon(L, vehicleType, bearing, selected) {
  const size = selected ? 40 : 32;
  const bg = selected ? '#f37021' : '#390955';
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;transform:rotate(${bearing}deg);">
      <div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${bg};"></div>
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;transform:rotate(${-bearing}deg);">
        <span style="font-size:${selected ? 16 : 14}px;">${vehicleEmoji(vehicleType)}</span>
      </div>
    </div>
  `;
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 6] });
}

function buildRiderPopupHtml(rider) {
  const hub = LOGISTICS_HUBS.find(h => h.hubId === rider.destinationHubId);
  return `
    <div style="font-family:sans-serif;font-size:12px;line-height:1.8;min-width:180px;">
      <b style="color:#390955;font-size:13px;">${rider.fullName}</b><br/>
      <span style="color:#9b82b2;font-size:11px;font-family:monospace;">${rider.riderId}</span><br/>
      <span style="color:#555;">${vehicleEmoji(rider.vehicleType)} ${rider.vehicleType}</span><br/>
      <span style="color:#16a34a;font-weight:700;">● Moving • ${rider.speedKmh || 30} km/h</span><br/>
      <span style="color:#888;">📍 ${rider.city || 'Luzon'}</span><br/>
      <span style="color:#f37021;">🏭 ${hub ? hub.hubName : '—'}</span>
    </div>
  `;
}

// One instance per active rider. Renders nothing itself — it owns a Leaflet
// marker + route polyline directly on the shared map and drives them with
// useRouteAnimation, so movement stays smooth without triggering a React
// re-render on every animation frame.
function AnimatedRiderMarker({ L, map, rider, isSelected, onSelect, trafficOn }) {
  const markerRef = useRef(null);
  const routeLineRef = useRef(null);

  useEffect(() => {
    if (!L || !map || !rider.route || rider.route.length < 2) return undefined;

    const line = L.polyline(rider.route.map(p => [p.lat, p.lng]), {
      color: trafficOn ? congestionColor(rider) : '#f37021', weight: 2.5, opacity: 0.45, dashArray: '7,6',
    }).addTo(map);
    routeLineRef.current = line;

    const marker = L.marker([rider.lat, rider.lng], {
      icon: buildRiderIcon(L, rider.vehicleType, 0, false),
      zIndexOffset: 1000,
    })
      .bindPopup(buildRiderPopupHtml(rider))
      .on('mouseover', function () { this.openPopup(); })
      .on('mouseout', function () { this.closePopup(); })
      .on('click', () => onSelect(rider.riderId))
      .addTo(map);
    markerRef.current = marker;

    return () => {
      line.remove();
      marker.remove();
      markerRef.current = null;
      routeLineRef.current = null;
    };
    // Recreated only if the rider's identity or its route genuinely changes —
    // not on every animation tick (that's handled imperatively below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, map, rider.riderId, rider.route]);

  const handleFrame = useCallback((state) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([state.lat, state.lng]);
      markerRef.current.setIcon(buildRiderIcon(L, rider.vehicleType, state.bearing, isSelected));
    }
    if (routeLineRef.current) {
      routeLineRef.current.setStyle({
        color: trafficOn ? congestionColor(rider) : '#f37021',
        opacity: isSelected ? 0.95 : 0.45,
        weight: isSelected ? 4.5 : 2.5,
        dashArray: isSelected ? null : '7,6',
      });
      if (isSelected) routeLineRef.current.bringToFront();
    }
  }, [L, rider, isSelected, trafficOn]);

  useRouteAnimation(rider.route, { speedKmh: rider.speedKmh || 30 }, handleFrame);

  return null;
}

export default function LiveRiderMap() {
  const [riders, setRiders]           = useState([]);
  const [parcels, setParcels]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [usingMock, setUsingMock]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedHub, setSelectedHub]     = useState(null);
  const [selectedRider, setSelectedRider] = useState(null);
  const [riderFilter, setRiderFilter]     = useState('all');
  const [mapReady, setMapReady]       = useState(false);
  const [layers, setLayers] = useState({ satellite: false, geofences: true, heatmap: false, traffic: false });
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);

  const divRef       = useRef(null);
  const mapRef       = useRef(null);
  const LRef         = useRef(null);
  const hubCircleRefs = useRef({});
  const hubMarkerRefs = useRef({});
  const tileLayerRef  = useRef(null);
  const heatLayerRef  = useRef(null);

  const toggleLayer = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  const fetchData = useCallback(async () => {
    try {
      const [rRes, pRes] = await Promise.all([fetch(RIDERS_API), fetch(PARCELS_API)]);
      const [rData, pData] = await Promise.all([rRes.json(), pRes.json()]);

      const activeRiders = rData
        .filter(r => {
          const st = String(r.status || 'active').toLowerCase();
          return st !== 'archived' && st !== 'inactive';
        })
        .map((r, i) => {
          const coords = CITY_COORDS[r.city] || LUZON_FALLBACK_COORDS;
          const lat = coords.lat + i * 0.004;
          const lng = coords.lng + i * 0.003;
          const hub = nearestHub(lat, lng);
          return {
            riderId: r.registrationId || r._id,
            fullName: r.riderName || 'Unknown Rider',
            vehicleType: r.vehicleType || 'Motorcycle',
            city: r.city || '',
            province: r.state || '',
            lat, lng,
            speedKmh: r.vehicleType === 'Bicycle' ? 18 : r.vehicleType === 'Van' ? 42 : 32,
            destinationHubId: hub.hubId,
            // Real DB records don't carry a planned path, so the honest
            // representation is a direct line to the nearest hub.
            route: [{ lat, lng }, { lat: hub.coordinates.lat, lng: hub.coordinates.lng }],
          };
        });

      const activeParcels = pData
        .filter(p => !['delivered', 'returned', 'failed'].includes(p.status))
        .map((p, i) => {
          const coords = CITY_COORDS[p.destination] || CITY_COORDS[p.origin] || LUZON_FALLBACK_COORDS;
          return { ...p, lat: coords.lat + i * 0.003, lng: coords.lng + i * 0.0025 };
        });

      setRiders(activeRiders);
      setParcels(activeParcels);
      setUsingMock(false);
    } catch (err) {
      console.error('LiveRiderMap: falling back to Luzon mock data —', err);
      setRiders(MOCK_LUZON_RIDERS);
      setParcels(MOCK_LUZON_PARCELS);
      setUsingMock(true);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Build the base map + hub geofences ONCE. Rider markers are separate
  // child components (AnimatedRiderMarker) that mount/unmount themselves as
  // the riders list changes, so a 15s data refresh never tears down the map
  // (no flicker, no lost pan/zoom, and animations already in progress for
  // unchanged riders are undisturbed).
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    loadLeaflet().then(L => {
      if (!divRef.current || mapRef.current) return;
      const map = L.map(divRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([14.8, 120.9], 7);
      tileLayerRef.current = L.tileLayer(TILE_LAYERS.street.url, {
        attribution: TILE_LAYERS.street.attribution, maxZoom: 19,
      }).addTo(map);

      LOGISTICS_HUBS.forEach(hub => {
        const { lat, lng } = hub.coordinates;
        const color = hub.status === 'Offline' ? '#999' : hub.status === 'High Capacity' ? '#f37021' : '#390955';

        const circle = L.circle([lat, lng], {
          radius: hub.geofenceRadius * 1000,
          color, fillColor: color, fillOpacity: 0.07, weight: 2, dashArray: '6,4',
        }).addTo(map);
        circle.on('click', () => { setSelectedRider(null); setSelectedHub(prev => prev === hub.hubId ? null : hub.hubId); });
        hubCircleRefs.current[hub.hubId] = circle;

        const hubMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:32px;height:32px;border-radius:9px;background:${color};border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:15px;">🏭</div>`,
            iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18],
          }),
        })
          .bindPopup(`
            <div style="font-family:sans-serif;font-size:12px;line-height:1.7;">
              <b style="color:${color}">${hub.hubName}</b><br/>
              <span style="color:#888;font-size:11px;">${hub.hubId} · ${hub.region} · ${hub.geofenceRadius}km radius · ${hub.status}</span>
            </div>
          `)
          .on('click', () => { setSelectedRider(null); setSelectedHub(prev => prev === hub.hubId ? null : hub.hubId); })
          .addTo(map);
        hubMarkerRefs.current[hub.hubId] = hubMarker;
      });

      const bounds = LOGISTICS_HUBS.map(h => [h.coordinates.lat, h.coordinates.lng]);
      map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60] });

      mapRef.current = map;
      LRef.current = L;
      setMapReady(true);
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      hubCircleRefs.current = {};
      hubMarkerRefs.current = {};
      tileLayerRef.current = null;
      heatLayerRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Highlight the selected hub's geofence without touching anything else.
  useEffect(() => {
    Object.entries(hubCircleRefs.current).forEach(([id, circle]) => {
      const isSel = id === selectedHub;
      circle.setStyle({ weight: isSel ? 3.5 : 2, fillOpacity: isSel ? 0.16 : 0.07 });
    });
  }, [selectedHub]);

  // ── Layer toggle: Satellite (swaps the base tile layer) ──
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current || !tileLayerRef.current) return;
    const L = LRef.current, map = mapRef.current;
    map.removeLayer(tileLayerRef.current);
    const choice = layers.satellite ? TILE_LAYERS.satellite : TILE_LAYERS.street;
    tileLayerRef.current = L.tileLayer(choice.url, { attribution: choice.attribution, maxZoom: 19 });
    tileLayerRef.current.addTo(map);
    tileLayerRef.current.bringToBack();
  }, [layers.satellite, mapReady]);

  // ── Layer toggle: Geofences (show/hide hub circles + hub markers) ──
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    Object.values(hubCircleRefs.current).forEach(circle => {
      if (layers.geofences) { if (!map.hasLayer(circle)) circle.addTo(map); }
      else if (map.hasLayer(circle)) map.removeLayer(circle);
    });
    Object.values(hubMarkerRefs.current).forEach(marker => {
      if (layers.geofences) { if (!map.hasLayer(marker)) marker.addTo(map); }
      else if (map.hasLayer(marker)) map.removeLayer(marker);
    });
  }, [layers.geofences, mapReady]);

  // ── Layer toggle: Heatmap (lightweight density overlay, no plugin needed) ──
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return;
    const L = LRef.current, map = mapRef.current;
    if (heatLayerRef.current) { map.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }

    if (layers.heatmap) {
      const group = L.layerGroup();
      const points = [
        ...riders.map(r => ({ lat: r.lat, lng: r.lng })),
        ...parcels.map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) })).filter(p => p.lat && p.lng),
      ];
      points.forEach(pt => {
        [1400, 900, 500].forEach((radius, i) => {
          L.circle([pt.lat, pt.lng], {
            radius, stroke: false, fillColor: '#ef4444', fillOpacity: [0.06, 0.1, 0.16][i],
          }).addTo(group);
        });
      });
      group.addTo(map);
      heatLayerRef.current = group;
    }
  }, [layers.heatmap, mapReady, riders, parcels]);

  const hubMetrics = LOGISTICS_HUBS.map(hub => {
    const { lat, lng } = hub.coordinates;
    const parcelsInside = parcels.filter(p => {
      const pLat = parseFloat(p.lat), pLng = parseFloat(p.lng);
      return pLat && pLng && haversineKm(lat, lng, pLat, pLng) <= hub.geofenceRadius;
    });
    const assignedRidersCount = riders.filter(r => r.destinationHubId === hub.hubId).length;
    return { ...hub, activeParcelsCount: parcelsInside.length, parcelsInside, assignedRidersCount };
  });

  const hub = selectedHub ? hubMetrics.find(h => h.hubId === selectedHub) : null;
  const rider = selectedRider ? riders.find(r => r.riderId === selectedRider) : null;
  const riderDestHub = rider ? LOGISTICS_HUBS.find(h => h.hubId === rider.destinationHubId) : null;
  // "Currently scanned" = whatever's linked to this rider by riderId, the
  // same real signal GenerateRiderDataReport's Currently Held Shipments uses.
  const riderParcels = rider ? parcels.filter(p => p.riderId === rider.riderId) : [];

  const visibleRiders = riderFilter === 'all' ? riders : riders.filter(r => r.riderId === riderFilter);

  const handleSelectRiderFilter = (id) => {
    setRiderFilter(id);
    setSelectedHub(null);
    setSelectedRider(id === 'all' ? null : id);
  };

  const activeAlerts = buildLiveAlerts(riders).filter(a => !dismissedAlertIds.includes(a.id));
  const topAlert = activeAlerts[0];

  const card = { background: 'white', borderRadius: 14, border: '1px solid rgba(57,9,85,0.09)', boxShadow: '0 2px 16px rgba(57,9,85,0.06)', overflow: 'hidden' };
  const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 };
  const layerBtn = (active) => ({ padding: '6px 13px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${active ? '#390955' : '#e0d5f0'}`, background: active ? '#390955' : 'white', color: active ? 'white' : '#555' });

  return (
    <div style={card}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(57,9,85,0.07)', background: 'rgba(57,9,85,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🗺️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a0a2e' }}>Live Rider Map</div>
            <div style={{ fontSize: 11, color: '#9b82b2' }}>{LOGISTICS_HUBS.length} hubs · {riders.length} riders in motion · Luzon-only coverage</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {usingMock && <span style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', background: '#fff4ec', padding: '3px 9px', borderRadius: 20 }}>Showing sample Luzon data (backend unreachable)</span>}
          {lastUpdated && <span style={{ fontSize: 10, color: '#9b82b2', fontFamily: 'monospace' }}>Updated {lastUpdated}</span>}
          <button onClick={fetchData} style={{ padding: '5px 12px', background: 'white', border: '1.5px solid #e0d5f0', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#390955', cursor: 'pointer' }}>🔄 Refresh</button>
        </div>
      </div>

      {topAlert && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: topAlert.severity === 'danger' ? '#fee2e2' : '#fff4ec', borderBottom: `1px solid ${topAlert.severity === 'danger' ? '#fca5a5' : '#f9d4b6'}` }}>
          <span style={{ fontSize: 16 }}>{topAlert.severity === 'danger' ? '🚨' : '⚠️'}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: topAlert.severity === 'danger' ? '#991b1b' : '#c2410c', flex: 1 }}>
            {topAlert.type} — {topAlert.riderName} in {topAlert.zone} ({topAlert.minutesAgo} min ago)
            {activeAlerts.length > 1 && <span style={{ fontWeight: 500, opacity: 0.75 }}> · +{activeAlerts.length - 1} more active alert{activeAlerts.length - 1 !== 1 ? 's' : ''}</span>}
          </span>
          <button onClick={() => setDismissedAlertIds(prev => [...prev, topAlert.id])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: topAlert.severity === 'danger' ? '#991b1b' : '#c2410c', lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid rgba(57,9,85,0.07)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9b82b2', textTransform: 'uppercase', letterSpacing: 0.4 }}>Map Layers</span>
        <button style={layerBtn(layers.traffic)} onClick={() => toggleLayer('traffic')}>🚦 Traffic</button>
        <button style={layerBtn(layers.satellite)} onClick={() => toggleLayer('satellite')}>🛰️ Satellite</button>
        <button style={layerBtn(layers.geofences)} onClick={() => toggleLayer('geofences')}>⭕ Geofences</button>
        <button style={layerBtn(layers.heatmap)} onClick={() => toggleLayer('heatmap')}>🔥 Heatmap</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid rgba(57,9,85,0.07)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9b82b2', textTransform: 'uppercase', letterSpacing: 0.4 }}>Filter Rider</span>
        <select value={riderFilter} onChange={(e) => handleSelectRiderFilter(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${riderFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: riderFilter !== 'all' ? '#390955' : 'white', color: riderFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}>
          <option value="all">All riders — show every path</option>
          {riders.map(r => <option key={r.riderId} value={r.riderId}>{r.fullName} · {r.riderId}</option>)}
        </select>
        {riderFilter !== 'all' && <span style={{ fontSize: 11, color: '#9b82b2' }}>Showing 1 of {riders.length} riders</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0 }}>
        <div style={{ position: 'relative', height: 480 }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a890c0', fontWeight: 600, fontSize: 14, background: 'white' }}>
              Loading Luzon map data...
            </div>
          )}
          <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />

          {mapReady && !loading && visibleRiders.map(r => (
            <AnimatedRiderMarker
              key={r.riderId}
              L={LRef.current}
              map={mapRef.current}
              rider={r}
              isSelected={selectedRider === r.riderId}
              onSelect={(id) => { setSelectedHub(null); setSelectedRider(prev => prev === id ? null : id); }}
              trafficOn={layers.traffic}
            />
          ))}

          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1000, pointerEvents: 'none', background: 'rgba(255,255,255,0.96)', borderRadius: 9, padding: '8px 12px', border: '1px solid rgba(57,9,85,0.1)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { color: '#390955', label: 'Hub geofence', shape: 'circle' },
              { color: '#390955', label: 'Rider · rotates to heading', shape: 'pin' },
              { color: '#f37021', label: 'Route (hover/click rider for details)', shape: 'line' },
            ].map(x => (
              <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, color: '#555' }}>
                {x.shape === 'circle' && <div style={{ width: 9, height: 9, borderRadius: '50%', border: '2px dashed #390955', flexShrink: 0 }} />}
                {x.shape === 'pin'    && <div style={{ width: 9, height: 9, borderRadius: '50%', background: x.color, flexShrink: 0 }} />}
                {x.shape === 'line'   && <div style={{ width: 14, height: 3, background: x.color, borderRadius: 2, flexShrink: 0 }} />}
                {x.label}
              </div>
            ))}
          </div>
        </div>

        {/* Side detail panel */}
        <div style={{ borderLeft: '1px solid rgba(57,9,85,0.07)', padding: '16px 18px', maxHeight: 480, overflowY: 'auto' }}>
          {!hub && !rider && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>Hub Overview</div>
              {hubMetrics.map(h => {
                const colors = HUB_STATUS_COLORS[h.status];
                return (
                  <div key={h.hubId} style={{ border: '1.5px solid rgba(57,9,85,0.1)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}
                    onClick={() => setSelectedHub(h.hubId)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1a0a2e' }}>{h.hubName}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: colors.bg, color: colors.color }}>{h.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9b82b2', marginTop: 4 }}>📦 {h.activeParcelsCount} parcels · 🛵 {h.assignedRidersCount} riders</div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 6, textAlign: 'center' }}>Click a hub, or hover/click a moving rider on the map.</div>
            </div>
          )}

          {hub && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a0a2e' }}>{hub.hubName}</div>
                <button onClick={() => setSelectedHub(null)} style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid rgba(57,9,85,0.15)', background: 'white', cursor: 'pointer', color: '#9b82b2', fontSize: 12 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: '#9b82b2', marginBottom: 12, fontFamily: 'monospace' }}>{hub.hubId} · {hub.region}</div>
              <div style={statRow}><span style={{ color: '#888' }}>Status</span><span style={{ fontWeight: 700 }}>{hub.status}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Geofence Radius</span><span style={{ fontWeight: 700 }}>{hub.geofenceRadius} km</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Active Parcels Inside</span><span style={{ fontWeight: 700, color: '#f37021' }}>{hub.activeParcelsCount}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Assigned Riders</span><span style={{ fontWeight: 700, color: '#390955' }}>{hub.assignedRidersCount}</span></div>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 }}>Currently Scanned Parcels</div>
              {hub.parcelsInside.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0' }}>No parcels currently inside this geofence.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {hub.parcelsInside.map(p => (
                    <div key={p._id} style={{ padding: '8px 10px', background: '#faf8ff', border: '1px solid rgba(57,9,85,0.08)', borderRadius: 8 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#f37021' }}>{p.trackingNumber}</div>
                      <div style={{ fontSize: 11, color: '#9b82b2', marginTop: 2 }}>{p.item || '—'} · {p.status}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {rider && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a0a2e' }}>{vehicleEmoji(rider.vehicleType)} {rider.fullName}</div>
                <button onClick={() => setSelectedRider(null)} style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid rgba(57,9,85,0.15)', background: 'white', cursor: 'pointer', color: '#9b82b2', fontSize: 12 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: '#9b82b2', marginBottom: 12, fontFamily: 'monospace' }}>{rider.riderId}</div>
              <div style={statRow}><span style={{ color: '#888' }}>Vehicle Type</span><span style={{ fontWeight: 700 }}>{rider.vehicleType}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Live Status</span><span style={{ fontWeight: 700, color: '#16a34a' }}>● Moving • {rider.speedKmh || 30} km/h</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Current Location</span><span style={{ fontWeight: 700 }}>{rider.city || '—'}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Destination Hub</span><span style={{ fontWeight: 700, color: '#f37021' }}>{riderDestHub?.hubName || '—'}</span></div>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 }}>Currently Scanned Parcels</div>
              {riderParcels.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0' }}>No parcels currently assigned to this rider.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {riderParcels.map(p => (
                    <div key={p._id} style={{ padding: '8px 10px', background: '#faf8ff', border: '1px solid rgba(57,9,85,0.08)', borderRadius: 8 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#f37021' }}>{p.trackingNumber}</div>
                      <div style={{ fontSize: 11, color: '#9b82b2', marginTop: 2 }}>{p.item || '—'} · {p.status}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
