import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { apiFetch, parcelLocationsApi, parcelsApi, ridersApi } from './services/api';
import useSSE from './services/useSSE';
import Modal from './components/ui/Modal';
import { useToast } from './components/ui/useToast';
import PageHeader from './components/ui/PageHeader';
import SectionCard from './components/ui/SectionCard';
import CardSectionHeader from './components/ui/CardSectionHeader';
import CardFooter from './components/ui/CardFooter';
import FilterBar from './components/ui/FilterBar';
import TableSkeleton from './components/ui/TableSkeleton';
import EmptyState from './components/ui/EmptyState';
import Badge from './components/ui/Badge';
import DataTable from './components/ui/DataTable';
import PaginationControls from './PaginationControls';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import { loadLeaflet } from './leafletLoader';
import { LOGISTICS_HUBS, haversineKm } from './hubGeofenceData';
import './ManageParcelLocation.css';
import {
  AlertTriangle, MapPin, Pencil, RotateCw, Check, Search, Map,
  Hash, Bike, Navigation, Building2, Shield, Calendar, Eye, Copy, X,
  ExternalLink, Compass, ShieldCheck, Layers,
} from 'lucide-react';

const now = () => new Date().toISOString().slice(0,16).replace('T',' ');

const TABLE_HEADERS = [
  { label: 'Tracking ID', icon: Hash, sticky: true },
  { label: 'Assigned Rider', icon: Bike },
  { label: 'Current Hub / City', icon: MapPin },
  { label: 'Coordinates', icon: Navigation },
  { label: 'Location Type', icon: Building2 },
  { label: 'Hub Boundary', icon: Shield },
  { label: 'Last Scan Timestamp', icon: Calendar },
  { label: 'Actions', icon: null, align: 'right' },
];

const LOCATION_EXPORT_COLUMNS = [
  { key: 'parcelId', label: 'Tracking ID' },
  { key: 'assignedRider', label: 'Assigned Rider' },
  { key: 'location', label: 'Current Hub / City' },
  { key: 'coordinates', label: 'Coordinates' },
  { key: 'type', label: 'Location Type' },
  { key: 'geofence', label: 'Delivery Hub Boundary' },
  { key: 'status', label: 'Status' },
  { key: 'lastScan', label: 'Last Scan Timestamp' },
];

function EditModal({ row, onSave, onClose }) {
  const [lat,  setLat]  = useState(row.lat);
  const [lng,  setLng]  = useState(row.lng);
  const [loc,  setLoc]  = useState(row.location);
  const [type, setType] = useState(row.type);
  const [stat, setStat] = useState(row.status);
  const [geo,  setGeo]  = useState(row.geofence || 'Inside');
  const valid = lat && lng && loc && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng));

  const setPulilanPreset = () => {
    setLat('14.9037');
    setLng('120.8667');
    setLoc('Pulilan Central Hub');
    setType('Warehouse');
    setStat('Active');
    setGeo('Inside');
  };

  return (
    <Modal onBackdropClick={onClose} zIndex={99999} maxWidth={520} tint="rgba(0,0,0,0.4)" cardStyle={{ borderRadius: 12, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
          <h3 style={{ color:'#390955', margin:0, fontSize:'18px', fontWeight:700 }}>Edit Location Details</h3>
          <button
            type="button"
            onClick={setPulilanPreset}
            className="text-[11px] font-bold text-[#390955] bg-[#f0eaf8] hover:bg-[#e4d6f3] px-2.5 py-1 rounded-md transition-colors cursor-pointer"
          >
            Preset: Pulilan Central Hub
          </button>
        </div>
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
            <label>Delivery Hub Boundary</label>
            <select value={geo} onChange={e=>setGeo(e.target.value)}>
              <option value="Inside">Inside Boundary</option>
              <option value="Outside">Outside Boundary</option>
            </select>
          </div>
        </div>
        {!valid && <div style={{ fontSize:12, color:'#9b1c1c', marginTop:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={14} aria-hidden="true" /> Coordinates must be valid numeric values.</div>}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', marginTop:'24px' }}>
          <button className="process-parcel-location-btn process-parcel-location-btn--secondary" style={{ margin:0 }} onClick={onClose}>Cancel</button>
          <button className="process-parcel-location-btn process-parcel-location-btn--primary" style={{ margin:0, opacity:valid?1:0.5 }} onClick={()=>valid && onSave({ lat, lng, location:loc, type, status:stat, geofence:geo })}>
            <Check size={14} className="inline mr-1" /> Save Changes
          </button>
        </div>
    </Modal>
  );
}

function ParcelLocationMapPreview({ lat, lng, parcelId, locationName }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [isSatellite, setIsSatellite] = useState(false);

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  const hasValidCoords = !isNaN(numLat) && !isNaN(numLng) && numLat !== 0 && numLng !== 0;

  useEffect(() => {
    if (!hasValidCoords || !mapContainerRef.current) return undefined;

    let isMounted = true;
    loadLeaflet().then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView([numLat, numLng], 15);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const streetTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      tileLayerRef.current = streetTile;

      // 100m geofence ring
      L.circle([numLat, numLng], {
        radius: 100,
        color: '#390955',
        fillColor: '#390955',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '4, 4',
      }).addTo(map);

      // Custom brand pin marker
      const pinHtml = `
        <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <div style="width:32px;height:32px;border-radius:10px;background:#390955;border:2.5px solid #ffffff;box-shadow:0 3px 12px rgba(57,9,85,0.45);display:flex;align-items:center;justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
        </div>
      `;

      const marker = L.marker([numLat, numLng], {
        icon: L.divIcon({
          className: '',
          html: pinHtml,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        }),
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;line-height:1.6;min-width:160px;padding:2px;">
          <div style="font-weight:700;color:#390955;font-size:13px;margin-bottom:2px;">${parcelId || 'Parcel'}</div>
          <div style="color:#475569;font-size:11px;">${locationName || 'Current Location'}</div>
          <div style="color:#64748b;font-family:monospace;font-size:10px;margin-top:4px;">${numLat.toFixed(5)}, ${numLng.toFixed(5)}</div>
        </div>
      `);

      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      tileLayerRef.current = null;
      setMapReady(false);
    };
  }, [numLat, numLng, parcelId, locationName, hasValidCoords]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !tileLayerRef.current) return;
    loadLeaflet().then((L) => {
      if (!mapInstanceRef.current || !tileLayerRef.current) return;
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
      const url = isSatellite
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      const attribution = isSatellite ? 'Tiles © Esri' : '© OpenStreetMap contributors';
      tileLayerRef.current = L.tileLayer(url, { attribution, maxZoom: 19 }).addTo(mapInstanceRef.current);
      tileLayerRef.current.bringToBack();
    });
  }, [isSatellite, mapReady]);

  const recenterMap = () => {
    if (mapInstanceRef.current && hasValidCoords) {
      mapInstanceRef.current.setView([numLat, numLng], 15);
    }
  };

  if (!hasValidCoords) {
    return (
      <div className="w-full h-full min-h-[340px] flex flex-col items-center justify-center p-8 bg-[#faf8fc] border border-dashed border-[#dcd3e8] rounded-xl text-center">
        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-[#390955] mb-3">
          <Navigation size={22} className="text-slate-400" />
        </div>
        <p className="text-xs font-bold text-slate-700 mb-1">No Geographic Coordinates Available</p>
        <p className="text-[11px] text-slate-500 max-w-[260px]">
          This parcel has not reported a geographic fix yet. Coordinates will appear once the courier records a scan with location enabled.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[340px] rounded-xl overflow-hidden border border-[#e2d9ec] bg-slate-100 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full min-h-[340px]" />

      <div className="absolute top-3 right-3 z-[400] flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-2 py-1.5 rounded-lg border border-[#dcd3e8] shadow-sm">
        <button
          type="button"
          onClick={() => setIsSatellite((prev) => !prev)}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
            isSatellite
              ? 'bg-[#390955] text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
          title="Toggle Satellite Imagery"
        >
          {isSatellite ? 'Satellite' : 'Street'}
        </button>
        <button
          type="button"
          onClick={recenterMap}
          className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          title="Center on Parcel"
        >
          Center
        </button>
      </div>

      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#dcd3e8] shadow-sm flex items-center gap-1.5 text-[10px] font-bold text-[#390955]">
        <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[#390955] bg-[#390955]/20 inline-block" />
        100m Delivery Ring
      </div>
    </div>
  );
}

export default function ProcessParcelLocation() {
  const [locations,      setLocations]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [activeTab,      setActiveTab]      = useState('parcel');
  const [editTarget,     setEditTarget]     = useState(null);
  const [search,         setSearch]         = useState('');
  const [boundaryFilter, setBoundaryFilter] = useState('all');
  const [typeFilter,     setTypeFilter]     = useState('all');
  const [copiedId,       setCopiedId]       = useState(null);
  const [copiedCoords,   setCopiedCoords]   = useState(false);
  const toast = useToast();
  const [gpsQuery,       setGpsQuery]       = useState('');
  const [gpsResult,      setGpsResult]      = useState(null);
  const [gpsError,       setGpsError]       = useState('');

  const [currentPage,    setCurrentPage]    = useState(1);
  const [rowsPerPage,    setRowsPerPage]    = useState(10);

  // Tracking Number → Rider ID → Rider Name, so the "Assigned Rider" column
  // can be resolved even though ParcelLocation records themselves don't
  // store a rider (they're just scan/coordinate logs, keyed by parcelId).
  const [parcelRiderByTracking, setParcelRiderByTracking] = useState({});
  const [riderNameById,         setRiderNameById]         = useState({});
  const [parcelsList,           setParcelsList]           = useState([]);

  useEffect(() => {
    fetchLocations();
    fetchRiderLinks();
  }, []);

  // SSE real-time updates for newly created or updated parcels
  const { on } = useSSE();
  useEffect(() => {
    const unsub1 = on('location-synced', () => { fetchLocations(); fetchRiderLinks(); });
    const unsub2 = on('parcel-synced',   () => { fetchLocations(); fetchRiderLinks(); });
    const unsub3 = on('parcel-updated',  () => { fetchLocations(); fetchRiderLinks(); });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on]);

  const fetchLocations = async () => {
    try {
      const data = await parcelLocationsApi.list();
      setLocations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching locations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRiderLinks = async () => {
    try {
      const [pData, rData] = await Promise.all([parcelsApi.list(), ridersApi.list()]);
      const safeParcels = Array.isArray(pData) ? pData : [];
      setParcelsList(safeParcels);

      const pMap = {};
      safeParcels.forEach(p => {
        const tn = p.trackingNumber || p.trackingId;
        if (tn) pMap[tn] = p.riderId || '';
      });

      const rMap = {};
      (Array.isArray(rData) ? rData : []).forEach(r => {
        const name = r.riderName || r.fullName || '—';
        if (r.registrationId) rMap[r.registrationId] = name;
        if (r._id) rMap[String(r._id)] = name;
        if (r.email) rMap[r.email.toLowerCase()] = name;
      });

      setParcelRiderByTracking(pMap);
      setRiderNameById(rMap);
    } catch (err) {
      console.error('Error fetching rider links:', err);
    }
  };

  const assignedRiderFor = useCallback((parcelId) => {
    const riderId = parcelRiderByTracking[parcelId];
    return riderId ? (riderNameById[riderId] || riderId) : '';
  }, [parcelRiderByTracking, riderNameById]);

  const showMessage = (msg, type = 'success') => toast(msg, type === 'error' ? 'error' : 'success');

  const handleSaveEdit = async (updates) => {
    try {
      await apiFetch(`/parcel-locations/${editTarget._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, updatedAt: now() }),
      });
      await fetchLocations();
      if (gpsResult && gpsResult._id === editTarget._id) {
        setGpsResult(prev => ({ ...prev, ...updates }));
      }
      setEditTarget(null);
      showMessage('Location details updated successfully');
    } catch {
      showMessage('Error updating location', 'error');
    }
  };

  const handleGpsLookup = async () => {
    const q = gpsQuery.trim().toUpperCase();
    if (!q) { setGpsError('Please provide a Parcel ID.'); setGpsResult(null); return; }

    // 1. Search in local locations
    const found = locations.find(r => r.parcelId?.toUpperCase() === q);
    if (found) {
      setGpsResult(found);
      setGpsError('');
      return;
    }

    // 2. Search in parcelsList
    const foundParcel = parcelsList.find(p => (p.trackingNumber || p.trackingId || '').toUpperCase() === q);
    if (foundParcel) {
      const center = foundParcel.trackingGeofence?.center;
      const lat = center?.lat ? String(center.lat) : (foundParcel.riderLat !== undefined && foundParcel.riderLat !== null ? String(foundParcel.riderLat) : null);
      const lng = center?.lng ? String(center.lng) : (foundParcel.riderLng !== undefined && foundParcel.riderLng !== null ? String(foundParcel.riderLng) : null);
      setGpsResult({
        _id: foundParcel._id,
        parcelId: foundParcel.trackingNumber || foundParcel.trackingId,
        lat,
        lng,
        noPosition: lat === null || lng === null,
        location: foundParcel.origin || foundParcel.destination || 'Pulilan Sorting Hub',
        type: 'Warehouse',
        status: foundParcel.status || 'Active',
        geofence: 'Inside',
        notes: foundParcel.item || '',
        updatedAt: foundParcel.updatedAt || foundParcel.createdAt || new Date().toISOString(),
      });
      setGpsError('');
      return;
    }

    // 3. Fallback: live query API directly
    try {
      const pRes = await apiFetch(`/parcels`);
      if (pRes.ok) {
        const list = await pRes.json();
        const p = Array.isArray(list) ? list.find(x => (x.trackingNumber || x.trackingId || '').toUpperCase() === q) : null;
        if (p) {
          const center = p.trackingGeofence?.center;
          const lat = center?.lat ? String(center.lat) : (p.riderLat !== undefined && p.riderLat !== null ? String(p.riderLat) : null);
          const lng = center?.lng ? String(center.lng) : (p.riderLng !== undefined && p.riderLng !== null ? String(p.riderLng) : null);
          setGpsResult({
            _id: p._id,
            parcelId: p.trackingNumber || p.trackingId,
            lat,
            lng,
            noPosition: lat === null || lng === null,
            location: p.origin || p.destination || 'Pulilan Sorting Hub',
            type: 'Warehouse',
            status: p.status || 'Active',
            geofence: 'Inside',
            notes: p.item || '',
            updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
          });
          setGpsError('');
          return;
        }
      }
    } catch { /* ignore */ }

    setGpsResult(null);
    setGpsError(`No match found for "${gpsQuery}".`);
  };

  const handleHeaderRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([fetchLocations(), fetchRiderLinks()]);
      showMessage('Location records refreshed successfully.');
    } catch (err) {
      console.error('Error refreshing locations:', err);
      showMessage('Failed to refresh locations.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGpsRefresh = () => {
    fetchLocations();
    showMessage('Location records refreshed successfully.');
  };

  const handleClearFilters = () => {
    setSearch('');
    setBoundaryFilter('all');
    setTypeFilter('all');
    setCurrentPage(1);
  };

  const handleCopyId = (e, parcelId) => {
    e.stopPropagation();
    if (!parcelId) return;
    navigator.clipboard.writeText(parcelId).then(() => {
      setCopiedId(parcelId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleExportLocations = (format) => {
    const exportData = filtered.map(r => ({
      parcelId: r.parcelId || '',
      assignedRider: assignedRiderFor(r.parcelId) || 'Unassigned',
      location: r.location || '',
      coordinates: `${r.lat}, ${r.lng}`,
      type: r.type || 'Warehouse',
      geofence: (r.geofence || 'Inside') === 'Inside' ? 'Inside Boundary' : 'Outside Boundary',
      status: r.status || 'Active',
      lastScan: r.updatedAt ? new Date(r.updatedAt).toLocaleString('en-PH') : '—',
    }));
    if (format === 'excel') {
      exportToExcel(exportData, LOCATION_EXPORT_COLUMNS, 'parcel-locations');
    } else if (format === 'word') {
      exportToWord(exportData, LOCATION_EXPORT_COLUMNS, 'parcel-locations', 'Parcel Locations Ledger');
    } else if (format === 'pdf') {
      exportToPDF(exportData, LOCATION_EXPORT_COLUMNS, 'parcel-locations', 'Parcel Locations Ledger');
    } else {
      exportToCSV(exportData, LOCATION_EXPORT_COLUMNS, 'parcel-locations');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations.filter(r => {
      const rider = assignedRiderFor(r.parcelId);
      const matchSearch = !q ||
        r.parcelId?.toLowerCase().includes(q) ||
        r.location?.toLowerCase().includes(q) ||
        rider.toLowerCase().includes(q);

      const isInside = (r.geofence || 'Inside') === 'Inside';
      const matchBoundary = boundaryFilter === 'all' ||
        (boundaryFilter === 'Inside' ? isInside : !isInside);

      const matchType = typeFilter === 'all' ||
        (r.type || '').toLowerCase() === typeFilter.toLowerCase();

      return matchSearch && matchBoundary && matchType;
    });
  }, [locations, search, boundaryFilter, typeFilter, assignedRiderFor]);

  const pageRows = useMemo(() => {
    return filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [filtered, currentPage, rowsPerPage]);

  const insideCount = useMemo(() => locations.filter(l => (l.geofence || 'Inside') === 'Inside').length, [locations]);
  const outsideCount = useMemo(() => locations.filter(l => l.geofence === 'Outside').length, [locations]);

  // Add Location was a manual-entry form — removed since GPS coordinates are
  // now captured automatically via the rider mobile app scan, not typed in
  // by an admin. Get Parcel Info is the default view.
  const tabs = [
    { key:'parcel', label:'Get Parcel Info',  icon: <MapPin size={14} aria-hidden="true" /> },
    { key:'gps',    label:'GPS Coordinates',  icon: <Map size={14} aria-hidden="true" /> },
  ];

  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', backgroundColor: '#f0ecf7', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <PageHeader
        title="Manage Parcel Location"
        subtitle="Track, monitor, map, and process regional parcel positioning logistics"
        breadcrumb={['Dashboard', 'Logistics Manager', 'Manage Parcel Location']}
        actions={(
          <RefreshButton
            onClick={handleHeaderRefresh}
            isRefreshing={isRefreshing || loading}
          />
        )}
      />

      <div className="flex items-center gap-2 border-b border-[#e8e0f0] pb-2 mb-6">
        {tabs.map(({ key, icon, label }) => (
          <button
            key={key}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === key
                ? 'bg-[#390955] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
            onClick={() => setActiveTab(key)}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {/* TAB 1: PARCEL LOCATION RECORDS — default view */}
        {activeTab === 'parcel' && (
          <SectionCard
            noPadding
            className="w-full"
            footer={(
              <CardFooter
                resultsLabel={`Showing ${filtered.length} of ${locations.length} records`}
                pills={[
                  { label: 'Inside Boundary', value: insideCount, tone: 'purple' },
                  { label: 'Outside Boundary', value: outsideCount, tone: 'amber' },
                ]}
              />
            )}
          >
            <CardSectionHeader
              icon={MapPin}
              title="Scanned Location Log"
              subtitle={`${filtered.length} of ${locations.length} records — real-time scan coordinates and positioning captured from rider devices`}
            />

            <FilterBar>
              <FilterBar.Group>
                <FilterBar.Search
                  placeholder="Search tracking ID, rider, hub..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                />
                <FilterBar.Select
                  aria-label="Filter by boundary"
                  value={boundaryFilter}
                  onChange={e => { setBoundaryFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">All Boundaries</option>
                  <option value="Inside">Inside Boundary</option>
                  <option value="Outside">Outside Boundary</option>
                </FilterBar.Select>
                <FilterBar.Select
                  aria-label="Filter by hub type"
                  value={typeFilter}
                  onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">All Hub Types</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="distribution">Distribution</option>
                  <option value="branch">Branch</option>
                  <option value="depot">Depot</option>
                  <option value="delivery point">Delivery Point</option>
                </FilterBar.Select>
                <FilterBar.Count count={filtered.length} label="locations" />
              </FilterBar.Group>

              <FilterBar.Actions>
                {(search || boundaryFilter !== 'all' || typeFilter !== 'all') && (
                  <button
                    onClick={handleClearFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-sm cursor-pointer"
                  >
                    <X size={13} aria-hidden="true" /> Clear Filters
                  </button>
                )}

                <ExportDropdown
                  onExport={handleExportLocations}
                  disabled={filtered.length === 0}
                />
              </FilterBar.Actions>
            </FilterBar>

            <div style={{ padding: '8px 24px 24px' }}>
              <DataTable className="min-w-[1080px]" containerClassName="border border-[#e4d8f2] rounded-xl">
                <DataTable.Head>
                  <tr>
                    {TABLE_HEADERS.map((h) => (
                      <DataTable.Th
                        key={h.label}
                        className="whitespace-nowrap"
                        stickyLeft={h.sticky}
                        align={h.align || 'left'}
                      >
                        {h.icon ? (
                          <span className="flex items-center gap-1.5">
                            <h.icon size={12} className="text-slate-400" />
                            {h.label}
                          </span>
                        ) : (
                          <span>{h.label}</span>
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
                      <td colSpan={TABLE_HEADERS.length} style={{ padding: '36px 16px' }}>
                        <EmptyState
                          icon={MapPin}
                          title="No scanned locations found"
                          description={
                            search || boundaryFilter !== 'all' || typeFilter !== 'all'
                              ? 'No location records match your current filters. Try changing keywords or resetting filters.'
                              : 'Records appear here once a rider scans a parcel with the mobile app.'
                          }
                          action={
                            (search || boundaryFilter !== 'all' || typeFilter !== 'all') ? (
                              <button
                                onClick={handleClearFilters}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#390955] text-white text-xs font-bold hover:brightness-110 transition shadow-sm cursor-pointer"
                              >
                                <RotateCw size={12} /> Reset Filters
                              </button>
                            ) : null
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => {
                      const rider = assignedRiderFor(row.parcelId);
                      const isInside = (row.geofence || 'Inside') === 'Inside';
                      return (
                        <DataTable.Row key={row._id}>
                          <DataTable.Cell stickyLeft className="font-mono font-bold text-xs text-[#f37021]">
                            <div className="flex items-center gap-1.5">
                              <span>{row.parcelId}</span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyId(e, row.parcelId)}
                                className="text-slate-400 hover:text-[#390955] transition-colors p-0.5 cursor-pointer"
                                title="Copy tracking ID"
                              >
                                {copiedId === row.parcelId ? (
                                  <Check size={11} className="text-emerald-600" />
                                ) : (
                                  <Copy size={11} />
                                )}
                              </button>
                            </div>
                          </DataTable.Cell>
                          <DataTable.Cell className="font-bold text-slate-800">
                            {rider ? (
                              <span className="inline-flex items-center gap-1.5 text-[#390955]">
                                <Bike size={13} className="text-purple-600" aria-hidden="true" /> {rider}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">Unassigned</span>
                            )}
                          </DataTable.Cell>
                          <DataTable.Cell className="font-bold text-[#390955]">
                            {row.location || '—'}
                          </DataTable.Cell>
                          <DataTable.Cell className="font-mono text-purple-700 font-semibold text-xs">
                            {row.lat}, {row.lng}
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <Badge tone="slate">{row.type || 'Warehouse'}</Badge>
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <Badge tone={isInside ? 'purple' : 'amber'}>
                              {isInside ? 'Inside Boundary' : 'Outside Boundary'}
                            </Badge>
                          </DataTable.Cell>
                          <DataTable.Cell className="text-slate-500 text-xs">
                            {row.updatedAt ? new Date(row.updatedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </DataTable.Cell>
                          <DataTable.Cell align="right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setGpsQuery(row.parcelId);
                                  setGpsResult(row);
                                  setActiveTab('gps');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#390955] bg-[#f0eaf8] hover:bg-[#e4d6f3] transition-colors cursor-pointer"
                                title="Inspect in Location Lookup"
                              >
                                <Eye size={12} /> Inspect
                              </button>
                              <button
                                onClick={() => setEditTarget(row)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#475569] bg-white border border-[#cbd5e1] hover:bg-slate-50 transition-colors cursor-pointer"
                                title="Edit Location Details"
                              >
                                <Pencil size={11} /> Edit
                              </button>
                            </div>
                          </DataTable.Cell>
                        </DataTable.Row>
                      );
                    })
                  )}
                </tbody>
              </DataTable>

              {filtered.length > 0 && (
                <div className="pt-4">
                  <PaginationControls
                    currentPage={currentPage}
                    totalRecords={filtered.length}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[10, 25, 50]}
                    onPageChange={setCurrentPage}
                    onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
                  />
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* TAB 2: GPS LOOKUP */}
        {activeTab === 'gps' && (
          <SectionCard
            title="Parcel Location Lookup"
            subtitle="View stored scan coordinates and interactive map preview for a parcel"
            actions={
              <button
                onClick={handleGpsRefresh}
                className="flex items-center gap-1.5 h-[34px] px-3.5 rounded-lg bg-white border border-[#390955] text-[#390955] text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
              >
                <RotateCw size={13} aria-hidden="true" /> Refresh Coordinates
              </button>
            }
          >
            <div className="p-6 space-y-4">
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                Coordinates reflect the last recorded checkpoint from mobile courier scans. Refresh retrieves recent location logs; positions update as couriers complete transit scans.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end bg-[#faf8fc]/60 p-4 rounded-xl border border-[#e8e0f0]">
                <div className="relative">
                  <label className="block text-xs font-bold text-[#390955] uppercase tracking-wider mb-1.5">Target Parcel ID</label>
                  <div className="relative">
                    <input
                      placeholder="e.g. YTO2026... or PKG-2026..."
                      value={gpsQuery}
                      onChange={e => { setGpsQuery(e.target.value); setGpsError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleGpsLookup()}
                      className="w-full h-[40px] pl-3.5 pr-9 border border-[#cbd5e1] rounded-lg text-xs font-semibold text-[#390955] bg-white focus:outline-none focus:border-[#390955] transition-colors"
                    />
                    {gpsQuery && (
                      <button
                        type="button"
                        onClick={() => { setGpsQuery(''); setGpsResult(null); setGpsError(''); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="h-[40px] px-5 rounded-lg bg-[#390955] text-white text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                  onClick={handleGpsLookup}
                >
                  <Search size={14} /> Look Up Coordinates
                </button>
              </div>

              {locations.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center pt-0.5">
                  <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Quick Suggestions:</span>
                  {locations.slice(0, 5).map(r => (
                    <button
                      key={r._id || r.parcelId}
                      type="button"
                      onClick={() => { setGpsQuery(r.parcelId); setGpsResult(r); setGpsError(''); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        gpsResult?.parcelId === r.parcelId
                          ? 'bg-[#390955] text-white border-[#390955]'
                          : 'border-[#dcd3e8] bg-white text-[#390955] hover:border-[#390955]'
                      }`}
                    >
                      {r.parcelId}
                    </button>
                  ))}
                </div>
              )}

              {gpsError && (
                <div className="flex items-center gap-2 p-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle size={14} aria-hidden="true" /> {gpsError}
                </div>
              )}

              {gpsResult && (() => {
                const isInside = (gpsResult.geofence || 'Inside').toLowerCase() === 'inside';
                const rider = assignedRiderFor(gpsResult.parcelId) || gpsResult.assignedRider || '';
                const numLat = parseFloat(gpsResult.lat);
                const numLng = parseFloat(gpsResult.lng);
                const hasValidCoords = !gpsResult.noPosition && !isNaN(numLat) && !isNaN(numLng) && numLat !== 0 && numLng !== 0;
                const distKm = (hasValidCoords && LOGISTICS_HUBS[0]?.coordinates)
                  ? haversineKm(numLat, numLng, LOGISTICS_HUBS[0].coordinates.lat, LOGISTICS_HUBS[0].coordinates.lng)
                  : null;
                const formattedCoords = hasValidCoords ? `${numLat.toFixed(5)}, ${numLng.toFixed(5)}` : 'Unavailable';
                const googleMapsUrl = hasValidCoords
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${numLat},${numLng}`)}`
                  : null;

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2 items-start">
                    {/* Left Column: Specs, Courier details, Distance to Hub, Action buttons */}
                    <div className="lg:col-span-5 space-y-3.5">
                      {/* Top Header Card with Tracking ID and Boundary Badge */}
                      <div className="bg-[#390955] rounded-xl overflow-hidden shadow-sm text-white p-4">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                            Recorded Parcel Telemetry
                          </span>
                          <Badge tone={isInside ? 'purple' : 'amber'}>
                            {isInside ? 'Inside Boundary' : 'Outside Boundary'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-lg font-mono font-extrabold text-white tracking-wide">
                              {gpsResult.parcelId}
                            </div>
                            <div className="text-xs text-white/80 font-medium mt-0.5">
                              {gpsResult.location || 'Pulilan Central Hub'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!hasValidCoords) {
                                showMessage('Coordinates unavailable to copy', 'error');
                                return;
                              }
                              navigator.clipboard?.writeText(formattedCoords);
                              setCopiedCoords(true);
                              showMessage('Coordinates copied to clipboard');
                              setTimeout(() => setCopiedCoords(false), 2000);
                            }}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                            title="Copy Formatted Coordinates"
                          >
                            {copiedCoords ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* 2x2 Metric Grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-white border border-[#e8e2f0] rounded-xl p-3">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Bike size={11} className="text-purple-600" /> Assigned Courier
                          </div>
                          <div className="text-xs font-extrabold text-[#390955] truncate">
                            {rider || 'Unassigned'}
                          </div>
                        </div>

                        <div className="bg-white border border-[#e8e2f0] rounded-xl p-3">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Building2 size={11} className="text-purple-600" /> Facility Type
                          </div>
                          <div className="text-xs font-extrabold text-[#390955] truncate">
                            {gpsResult.type || 'Warehouse'}
                          </div>
                        </div>

                        <div className="bg-white border border-[#e8e2f0] rounded-xl p-3">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Compass size={11} className="text-purple-600" /> Coordinates
                          </div>
                          <div className="text-xs font-mono font-extrabold text-purple-700 truncate">
                            {formattedCoords}
                          </div>
                        </div>

                        <div className="bg-white border border-[#e8e2f0] rounded-xl p-3">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Navigation size={11} className="text-purple-600" /> Distance to Hub
                          </div>
                          <div className="text-xs font-extrabold text-[#390955] truncate">
                            {distKm !== null && !isNaN(distKm)
                              ? (distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(2)} km`)
                              : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Timestamp strip */}
                      <div className="bg-[#faf8fc] border border-[#e8e2f0] rounded-xl px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-semibold">Last Recorded Scan:</span>
                        <span className="font-mono text-slate-700 font-semibold text-[11px]">
                          {gpsResult.updatedAt
                            ? new Date(gpsResult.updatedAt).toLocaleString('en-PH', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center gap-1.5 h-[36px] px-3 rounded-lg bg-[#390955] text-white text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm truncate"
                            onClick={() => setEditTarget(gpsResult)}
                          >
                            <Pencil size={12} /> Edit Details
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSearch(gpsResult.parcelId);
                              setActiveTab('parcel');
                            }}
                            className="inline-flex items-center justify-center gap-1.5 h-[36px] px-3 rounded-lg border border-[#cbd5e1] bg-white text-[#390955] text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer shadow-sm truncate"
                            title="Locate in Scanned Log Table"
                          >
                            <Eye size={12} /> View in Table
                          </button>
                        </div>

                        {googleMapsUrl && (
                          <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-flex items-center justify-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[#cbd5e1] bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                          >
                            <ExternalLink size={13} aria-hidden="true" /> Open in Google Maps
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Interactive Leaflet Map Preview */}
                    <div className="lg:col-span-7 flex flex-col h-full">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#390955] uppercase tracking-wider flex items-center gap-1.5">
                          <Map size={13} className="text-purple-600" /> Geographic Position Preview
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Pulilan Hub Service Area
                        </span>
                      </div>
                      <div className="flex-1 min-h-[360px]">
                        <ParcelLocationMapPreview
                          lat={gpsResult.lat}
                          lng={gpsResult.lng}
                          parcelId={gpsResult.parcelId}
                          locationName={gpsResult.location}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {!gpsResult && !gpsError && (
                <div className="space-y-4 pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[#390955] uppercase tracking-wider">
                        Recent Location Scans
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Select any recently recorded parcel to inspect its GPS coordinates and live map preview.
                      </p>
                    </div>
                    {locations.length > 0 && (
                      <span className="text-xs font-semibold text-slate-400 font-mono">
                        {locations.length} Total Records
                      </span>
                    )}
                  </div>

                  {locations.length === 0 ? (
                    <EmptyState
                      icon={Navigation}
                      title="No Recorded Scans"
                      description="No parcel location records have been received from mobile couriers yet. Positions will appear here once scans are logged."
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {locations.slice(0, 6).map((rec) => {
                        const isInside = (rec.geofence || 'Inside').toLowerCase() === 'inside';
                        const recRider = assignedRiderFor(rec.parcelId) || rec.assignedRider || '';
                        return (
                          <div
                            key={rec._id || rec.parcelId}
                            onClick={() => {
                              setGpsQuery(rec.parcelId);
                              setGpsResult(rec);
                              setGpsError('');
                            }}
                            className="group relative p-3.5 rounded-xl border border-[#e8e2f0] bg-white hover:border-[#390955] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="font-mono text-xs font-extrabold text-[#390955] group-hover:text-[#f37021] transition-colors truncate">
                                  {rec.parcelId}
                                </span>
                                <Badge tone={isInside ? 'purple' : 'amber'}>
                                  {isInside ? 'Inside' : 'Outside'}
                                </Badge>
                              </div>

                              <div className="text-xs font-semibold text-slate-700 truncate mb-1">
                                {rec.location || 'Pulilan Central Hub'}
                              </div>

                              <div className="text-[11px] font-mono text-slate-500 truncate">
                                {rec.lat && rec.lng ? `${rec.lat}, ${rec.lng}` : 'Coordinates pending'}
                              </div>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                              <span className="truncate flex items-center gap-1 text-slate-600">
                                <Bike size={11} className="text-purple-500" />
                                {recRider || 'Unassigned'}
                              </span>
                              <span className="text-[#390955] font-bold group-hover:translate-x-0.5 transition-transform">
                                Inspect →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      {editTarget && <EditModal row={editTarget} onClose={()=>setEditTarget(null)} onSave={handleSaveEdit}/>}
    </div>
  );
}