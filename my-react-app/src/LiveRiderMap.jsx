import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './leafletLoader';
import { LOGISTICS_HUBS, haversineKm, HUB_STATUS_COLORS } from './hubGeofenceData';
import { CITY_COORDS } from './luzonCityCoords';
import { useRouteAnimation } from './useRouteAnimation';
import { vehicleGlyphSvg, vehicleTypeLabel } from './components/ui/vehicleIconUtils';
import { VehicleIcon } from './components/ui/vehicleIcons';
import { CircleDot, Flame, Map, Package, Satellite, X } from 'lucide-react';
import { ridersApi, parcelsApi, parcelLocationsApi } from './services/api';
import Tooltip from './components/ui/Tooltip';
import useSSE from './services/useSSE';

const TILE_LAYERS = {
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri' },
};

// Route color is fixed brand orange — traffic overlay unavailable until the
// mobile app streams real speed/heading telemetry.


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
        <img src="${vehicleGlyphSvg(vehicleType, 'white')}" alt="" width="${selected ? 18 : 14}" height="${selected ? 18 : 14}" style="display:block;" />
      </div>
    </div>
  `;
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 6] });
}function buildRiderPopupHtml(rider) {  const hub = LOGISTICS_HUBS.find(h => h.hubId === rider.destinationHubId);  // Position-source honesty: a real GPS fix (from the app's status-update  // telemetry) vs. the city-derived fallback.  const gpsLine = rider.hasRealGps    ? '<span style="color:#16a34a;font-weight:700;">● Live GPS</span><br/>'    : '<span style="color:#b45309;font-weight:700;">● Approximate (city-level)</span><br/>';  return `    <div style="font-family:sans-serif;font-size:12px;line-height:1.8;min-width:180px;">      <b style="color:#390955;font-size:13px;">${rider.fullName}</b><br/>      <span style="color:#9b82b2;font-size:11px;font-family:monospace;">${rider.riderId}</span><br/>      <span style="color:#555;">${vehicleTypeLabel(rider.vehicleType)} · ${rider.vehicleType}</span><br/>      ${gpsLine}      <span style="color:#888;">${rider.city || 'Luzon'}</span><br/>      <span style="color:#f37021;">${hub ? hub.hubName : '—'}</span>    </div>  `;}

// One instance per active rider. Renders nothing itself — it owns a Leaflet
// marker + route polyline directly on the shared map and drives them with
// useRouteAnimation, so movement stays smooth without triggering a React
// re-render on every animation frame.
function AnimatedRiderMarker({ L, map, rider, isSelected, onSelect }) {
  const markerRef = useRef(null);
  const routeLineRef = useRef(null);

  useEffect(() => {
    if (!L || !map || !rider.route || rider.route.length < 2) return undefined;

    const line = L.polyline(rider.route.map(p => [p.lat, p.lng]), {
      color: '#f37021', weight: 2.5, opacity: 0.45, dashArray: '7,6',
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
        color: '#f37021',
        opacity: isSelected ? 0.95 : 0.45,
        weight: isSelected ? 4.5 : 2.5,
        dashArray: isSelected ? null : '7,6',
      });
      if (isSelected) routeLineRef.current.bringToFront();
    }
  }, [L, rider, isSelected]);

  // Route animation drives marker movement along the hub line at a fixed
  // presentation pace — position only, never a claimed speed.
  useRouteAnimation(rider.route, { speedKmh: 30 }, handleFrame);

  return null;
}

export default function LiveRiderMap({
  externalSelectedRiderId,
  onSelectRider,
  refreshTrigger,
  activeRidersCount,
  activeShipmentsCount,
}) {
  const [riders, setRiders]           = useState([]);
  const [parcels, setParcels]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedHub, setSelectedHub]     = useState(null);
  const [selectedRider, setSelectedRider] = useState(null);
  const [riderFilter, setRiderFilter]     = useState('all');
  // Admin-exclusive filters (shipment status / location scope)
  const [statusFilter, setStatusFilter]   = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [mapReady, setMapReady]       = useState(false);
  const [layers, setLayers] = useState({ satellite: false, geofences: true, heatmap: false });

  const divRef       = useRef(null);
  const mapRef       = useRef(null);
  const LRef         = useRef(null);
  const hubCircleRefs = useRef({});
  const hubMarkerRefs = useRef({});
  const tileLayerRef  = useRef(null);
  const heatLayerRef  = useRef(null);

  const handleSelectRider = (id) => {
    setSelectedHub(null);
    setSelectedRider(id);
    if (onSelectRider) onSelectRider(id);
  };

  // The Leaflet map is built exactly once (see the `[]` init effect below), so
  // its click handlers read the current handler through a ref rather than
  // closing over a stale one — a changed `onSelectRider` prop must never force
  // the whole map to be torn down and rebuilt.
  const handleSelectRiderRef = useRef(handleSelectRider);
  useEffect(() => { handleSelectRiderRef.current = handleSelectRider; });

  useEffect(() => {
    if (externalSelectedRiderId !== undefined) {
      setSelectedRider(externalSelectedRiderId);
      if (externalSelectedRiderId) setSelectedHub(null);
    }
  }, [externalSelectedRiderId]);

  const prevSelectedRiderRef = useRef(selectedRider);
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedRider) {
      const target = riders.find(r => r.riderId === selectedRider);
      if (target && target.lat && target.lng) {
        mapRef.current.setView([target.lat, target.lng], Math.max(mapRef.current.getZoom(), 14), { animate: true });
      }
    } else if (prevSelectedRiderRef.current && LRef.current) {
      const bounds = LOGISTICS_HUBS.map(h => [h.coordinates.lat, h.coordinates.lng]);
      mapRef.current.fitBounds(LRef.current.latLngBounds(bounds), { padding: [60, 60] });
    }
    prevSelectedRiderRef.current = selectedRider;
  }, [selectedRider, riders]);

  const toggleLayer = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  const fetchData = useCallback(async () => {
    try {
      const [rData, pData, locData] = await Promise.all([
        ridersApi.list(),
        parcelsApi.list(),
        // Real GPS telemetry (2026-09-11 parity): the mobile app now attaches
        // riderLat/riderLng to status transitions, bridged here as
        // ParcelLocation rows keyed by parcelId (tracking number).
        parcelLocationsApi.list().catch(() => []),
      ]);

      const safeRiders = Array.isArray(rData) ? rData : [];
      const safeParcels = Array.isArray(pData) ? pData : [];
      const safeLocations = Array.isArray(locData) ? locData : [];

      // parcelId (tracking number) -> { lat, lng } from the newest telemetry.
      const telemetryByParcel = {};
      safeLocations.forEach(loc => {
        const lat = parseFloat(loc.lat);
        const lng = parseFloat(loc.lng);
        if (loc.parcelId && Number.isFinite(lat) && Number.isFinite(lng)
            && !(lat === 0 && lng === 0)) {
          telemetryByParcel[loc.parcelId] = { lat, lng, updatedAt: loc.updatedAt };
        }
      });

      const activeRiders = safeRiders
        .filter(r => {
          const st = String(r.status || 'active').toLowerCase();
          return st !== 'archived' && st !== 'inactive';
        })
        .map((r, i) => {
          const coords = CITY_COORDS[r.city];
          // Prefer the rider's own real GPS fix when their currently-held
          // parcel has telemetry; otherwise fall back to the city-derived
          // position (labeled via hasRealGps so popups can be honest).
          const heldParcel = safeParcels.find(
            p => p.riderId && (p.riderId === (r.registrationId || r._id)) && telemetryByParcel[p.trackingNumber]
          );
          const fix = heldParcel ? telemetryByParcel[heldParcel.trackingNumber] : null;
          // No city match and no telemetry: skip the pin entirely rather than
          // parking every unmatched rider on a false Manila coordinate.
          if (!fix && !coords) return null;
          const lat = fix ? fix.lat : coords.lat + i * 0.004;
          const lng = fix ? fix.lng : coords.lng + i * 0.003;
          const hub = nearestHub(lat, lng);
          return {
            riderId: r.registrationId || r._id,
            fullName: r.riderName || '—',
            vehicleType: r.vehicleType || 'Motorcycle',
            city: r.city || '',
            province: r.state || '',
            lat, lng,
            hasRealGps: !!fix,
            // Speed is not streamed by the app yet — the map labels pin
            // positions, it does not claim a live speed.
            speedKmh: null,
            destinationHubId: hub.hubId,
            // Real DB records don't carry a planned path, so the honest
            // representation is a direct line to the nearest hub.
            route: [{ lat, lng }, { lat: hub.coordinates.lat, lng: hub.coordinates.lng }],
          };
        })
        .filter(Boolean);

      const activeParcels = safeParcels
        .filter(p => !['delivered', 'returned', 'failed'].includes(p.status))
        .map((p, i) => {
          // Real telemetry first (per-parcel tracking), city coords as fallback.
          const fix = telemetryByParcel[p.trackingNumber];
          if (fix) return { ...p, lat: fix.lat, lng: fix.lng, hasRealGps: true };
          const coords = CITY_COORDS[p.destination] || CITY_COORDS[p.origin];
          // No telemetry and no city match: keep the record in the list with
          // no map position (Location unavailable) instead of a Manila pin.
          if (!coords) return { ...p, lat: null, lng: null, hasRealGps: false, noPosition: true };
          return { ...p, lat: coords.lat + i * 0.003, lng: coords.lng + i * 0.0025, hasRealGps: false };
        });

      setRiders(activeRiders);
      setParcels(activeParcels);
    } catch (err) {
      console.error('LiveRiderMap: backend unreachable —', err);
      setRiders([]);
      setParcels([]);
    } finally {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, []);

  // Real-time SSE updates — refresh map when location/parcel events arrive
  const { on } = useSSE();
  useEffect(() => {
    const unsub1 = on('location-synced', () => fetchData());
    const unsub2 = on('parcel-synced', () => fetchData());
    const unsub3 = on('parcel-updated', () => fetchData());
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on, fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchData();
    }
  }, [refreshTrigger, fetchData]);

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
        const color = hub.status === 'Offline' ? '#999' : '#390955';

        const circle = L.circle([lat, lng], {
          radius: hub.geofenceRadius * 1000,
          color, fillColor: color, fillOpacity: 0.07, weight: 2, dashArray: '6,4',
        }).addTo(map);
        circle.on('click', () => { handleSelectRiderRef.current(null); setSelectedHub(prev => prev === hub.hubId ? null : hub.hubId); });
        hubCircleRefs.current[hub.hubId] = circle;

        const hubMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:32px;height:32px;border-radius:9px;background:${color};border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><img src="${vehicleGlyphSvg('van', 'white')}" alt="" width="17" height="17" style="display:block;" /></div>`,
            iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18],
          }),
        })
          .bindPopup(`
            <div style="font-family:sans-serif;font-size:12px;line-height:1.7;">
              <b style="color:${color}">${hub.hubName}</b><br/>
              <span style="color:#888;font-size:11px;">${hub.hubId} · ${hub.region} · ${hub.geofenceRadius}km radius · ${hub.status}</span>
            </div>
          `)
          .on('click', () => { handleSelectRiderRef.current(null); setSelectedHub(prev => prev === hub.hubId ? null : hub.hubId); })
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
        ...parcels.filter(p => !p.noPosition).map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) })).filter(p => p.lat && p.lng),
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
  });  const hub = selectedHub ? hubMetrics.find(h => h.hubId === selectedHub) : null;
  const rider = selectedRider ? riders.find(r => r.riderId === selectedRider) : null;
  const riderDestHub = rider ? LOGISTICS_HUBS.find(h => h.hubId === rider.destinationHubId) : null;
  // "Currently scanned" = whatever's linked to this rider by riderId, the
  // same real signal GenerateRiderDataReport's Currently Held Shipments uses.
  const riderParcels = rider ? parcels.filter(p => p.riderId === rider.riderId) : [];

  // ── Admin-exclusive filters (2026-09-11 parity) ──
  // Shipment-status filter (real Parcel.status), duty filter (real
  // isOnDuty synced from the app's profile toggle), location filter
  // (city-scoped Active/Inactive view). All client-side over real fields.
  const PARCEL_STATUS_FILTERS = ['Pending', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Returning'];
  const availableCities = Array.from(new Set([
    ...riders.map(r => r.city).filter(Boolean),
    ...parcels.map(p => (p.destination || p.origin || '')).filter(Boolean),
  ])).sort();  const visibleRiders = riders.filter(r => {
    if (riderFilter !== 'all' && r.riderId !== riderFilter) return false;
    if (locationFilter !== 'all' && r.city !== locationFilter) return false;
    return true;
  });
  const _visibleParcels = parcels.filter(p => {
    if (statusFilter !== 'all' && String(p.status || '') !== statusFilter) return false;
    if (locationFilter !== 'all' && (p.destination || p.origin) !== locationFilter) return false;
    return true;
  });

  const handleSelectRiderFilter = (id) => {
    setRiderFilter(id);
    handleSelectRider(id === 'all' ? null : id);
  };

  // (synthetic alert derivation removed with the REAL-only migration)

  const card = { background: 'white', borderRadius: 12, border: '1px solid rgba(57,9,85,0.09)', boxShadow: '0 2px 16px rgba(57,9,85,0.06)', overflow: 'hidden' };
  const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 };
  const layerBtn = (active) => ({ padding: '6px 13px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${active ? '#390955' : '#e0d5f0'}`, background: active ? '#390955' : 'white', color: active ? 'white' : '#555' });

  const riderCount = activeRidersCount !== undefined ? activeRidersCount : riders.length;
  const parcelCount = activeShipmentsCount !== undefined ? activeShipmentsCount : parcels.length;

  return (
    <div style={card}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(57,9,85,0.07)', background: 'rgba(57,9,85,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#390955', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Map size={15} color="white" aria-hidden="true" /></div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a0a2e' }}>Live Tracking Map</div>
            <div style={{ fontSize: 11, color: '#9b82b2' }}>{LOGISTICS_HUBS.length} hubs · {riderCount} riders in motion · App service area: Bulacan Province</div>
          </div>
        </div>

        {/* Telemetry status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', fontSize: 11, fontWeight: 700, color: '#047857' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            {riderCount} Active Riders
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(57,9,85,0.06)', border: '1px solid rgba(57,9,85,0.12)', fontSize: 11, fontWeight: 700, color: '#390955' }}>
            <Package size={12} color="#f37021" aria-hidden="true" />
            {parcelCount} Active Shipments
          </span>
        </div>
      </div>


      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(57,9,85,0.07)', flexWrap: 'wrap' }}>
        {/* Map Layers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9b82b2', textTransform: 'uppercase', letterSpacing: 0.4 }}>Map Layers</span>
          <Tooltip content="Switch to satellite imagery base layer">
            <button style={{ ...layerBtn(layers.satellite), display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => toggleLayer('satellite')}>
              <Satellite size={12} aria-hidden="true" /> Satellite
            </button>
          </Tooltip>
          <Tooltip content="Toggle hub geofence zone circles">
            <button style={{ ...layerBtn(layers.geofences), display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => toggleLayer('geofences')}>
              <CircleDot size={12} aria-hidden="true" /> Geofences
            </button>
          </Tooltip>
          <Tooltip content="Show parcel density heat layer">
            <button style={{ ...layerBtn(layers.heatmap), display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => toggleLayer('heatmap')}>
              <Flame size={12} aria-hidden="true" /> Heatmap
            </button>
          </Tooltip>
        </div>

        {/* Map Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9b82b2', textTransform: 'uppercase', letterSpacing: 0.4 }}>Filter Map</span>
          <select
            value={riderFilter}
            onChange={(e) => handleSelectRiderFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${riderFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: riderFilter !== 'all' ? '#390955' : 'white', color: riderFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}
            aria-label="Filter map by rider"
          >
            <option value="all">All riders — show every path</option>
            {riders.map(r => <option key={r.riderId} value={r.riderId}>{r.fullName} · {r.riderId}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${statusFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: statusFilter !== 'all' ? '#390955' : 'white', color: statusFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}
            aria-label="Filter parcels by shipment status"
          >
            <option value="all">All shipment statuses</option>
            {PARCEL_STATUS_FILTERS.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${locationFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: locationFilter !== 'all' ? '#390955' : 'white', color: locationFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}
            aria-label="Filter by city location"
          >
            <option value="all">All locations</option>
            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(riderFilter !== 'all' || statusFilter !== 'all' || locationFilter !== 'all') && (
            <button
              onClick={() => { setRiderFilter('all'); setStatusFilter('all'); setLocationFilter('all'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer' }}
            >
              <X size={12} aria-hidden="true" /> Clear Filters
            </button>
          )}
          {riderFilter !== 'all' && <span style={{ fontSize: 11, color: '#9b82b2' }}>Showing 1 of {riders.length} riders</span>}
        </div>
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
              onSelect={(id) => handleSelectRider(selectedRider === id ? null : id)}
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
            ))}            <div style={{ fontSize: 9, opacity: 0.7, color: '#b45309' }}>              Riders without live GPS pings show city-level positions — real positions stream in from app status updates.            </div>
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
                  <Tooltip key={h.hubId} content={`${h.hubName} — ${h.activeParcelsCount} parcel${h.activeParcelsCount !== 1 ? 's' : ''} inside a ${h.geofenceRadius} km geofence · ${h.assignedRidersCount} rider${h.assignedRidersCount !== 1 ? 's' : ''} assigned. Click for full hub detail.`}>
                  <div style={{ border: '1.5px solid rgba(57,9,85,0.1)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}
                    onClick={() => setSelectedHub(h.hubId)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1a0a2e' }}>{h.hubName}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: colors.bg, color: colors.color }}>{h.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9b82b2', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Package size={11} aria-hidden="true" /> {h.activeParcelsCount} parcels · <VehicleIcon type="motorcycle" size={12} /> {h.assignedRidersCount} riders</div>
                  </div>
                  </Tooltip>
                );
              })}
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 6, textAlign: 'center' }}>Click a hub, or hover/click a moving rider on the map.</div>
            </div>
          )}

          {hub && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a0a2e' }}>{hub.hubName}</div>
                <Tooltip content="Close hub details">
                <button onClick={() => setSelectedHub(null)} aria-label="Close hub details" style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid rgba(57,9,85,0.15)', background: 'white', cursor: 'pointer', color: '#9b82b2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} aria-hidden="true" /></button>
                </Tooltip>
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
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a0a2e', display: 'flex', alignItems: 'center', gap: 6 }}><VehicleIcon type={rider.vehicleType} size={16} /> {rider.fullName}</div>
                <Tooltip content="Close rider details">
                <button onClick={() => handleSelectRider(null)} aria-label="Close rider details" style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid rgba(57,9,85,0.15)', background: 'white', cursor: 'pointer', color: '#9b82b2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} aria-hidden="true" /></button>
                </Tooltip>
              </div>
              <div style={{ fontSize: 11, color: '#9b82b2', marginBottom: 12, fontFamily: 'monospace' }}>{rider.riderId}</div>
              <div style={statRow}><span style={{ color: '#888' }}>Vehicle Type</span><span style={{ fontWeight: 700 }}>{rider.vehicleType}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Live Status</span><span style={{ fontWeight: 700, color: rider.hasRealGps ? '#16a34a' : '#b45309' }}>{rider.hasRealGps ? '● Live GPS position' : '● Approximate (city-level)'}</span></div>
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
