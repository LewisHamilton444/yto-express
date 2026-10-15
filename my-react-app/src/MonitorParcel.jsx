import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LiveRiderMap from './LiveRiderMap';
import { extractMunicipality, matchRider } from './utils/bulacanLocationUtils';
import {
  ZONE_LABELS,
  ALL_MUNICIPALITIES,
  allZoneIds,
  municipalitiesOf,
  barangaysOf,
  zoneForMunicipality,
  sameBarangay,
  extractBarangayFromAddress,
} from './utils/deliveryZoneDirectory';
import { CITY_COORDS } from './luzonCityCoords';
import { LOGISTICS_HUBS, haversineKm } from './hubGeofenceData';
import { ridersApi, parcelsApi, parcelLocationsApi } from './services/api';
import { getFreshPing, formatLivePosition, LIVE_REFRESH_MS } from './utils/riderGps';
import { isFinishedParcelStatus, IN_FLIGHT_WEIGHT } from './utils/parcelStatus';
import { resolveParcelCurrentLocation } from './utils/parcelLocationResolver';
import useSSE from './services/useSSE';
import { VehicleIcon } from './components/ui/vehicleIcons';
import Tooltip from './components/ui/Tooltip';
import PageHeader from './components/ui/PageHeader';
import SectionCard from './components/ui/SectionCard';
import EmptyState from './components/ui/EmptyState';
import Badge from './components/ui/Badge';
import DataTable from './components/ui/DataTable';
import PaginationControls from './PaginationControls';
import CardFooter from './components/ui/CardFooter';
import FilterBar from './components/ui/FilterBar';
import RefreshButton from './components/ui/RefreshButton';
import ExportDropdown from './components/ui/ExportDropdown';
import { exportToCSV, exportToExcel, exportToWord, exportToPDF } from './exportUtils';
import {
  Package, Search, MapPin, ShieldCheck, Navigation,
  Bike, Hash, X, Copy, Check, List, LayoutGrid,
  Radio, Phone,
} from 'lucide-react';

const RIDER_EXPORT_COLUMNS = [
  { key: 'id', label: 'Rider ID' },
  { key: 'name', label: 'Rider Name' },
  { key: 'phone', label: 'Contact Phone' },
  { key: 'vehicle', label: 'Vehicle Type' },
  { key: 'location', label: 'Assigned Location' },
  { key: 'signal', label: 'Telemetry Signal' },
  { key: 'packagesCount', label: 'Assigned Shipments Count' },
  { key: 'proximity', label: 'Hub Proximity' },
  { key: 'boundary', label: 'Geofence Boundary' },
  { key: 'dutyStatus', label: 'Duty Status' },
];

const TABLE_HEADERS = [
  { label: 'Rider ID', icon: Hash, sticky: true },
  { label: 'Rider Name', icon: Bike },
  { label: 'Vehicle & Signal', icon: Radio },
  { label: 'Current Location', icon: MapPin },
  { label: 'Assigned Shipments', icon: Package },
  { label: 'Hub Proximity & Boundary', icon: ShieldCheck },
  { label: 'Actions', icon: null, align: 'right' },
];

export default function MonitorGeofenceBoundary() {
  const [riders, setRiders] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [riderSearch, setRiderSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [signalFilter, setSignalFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  // Zone -> Municipality -> Barangay cascade (deliveryZoneDirectory.js;
  // barangay data covers 3/24 towns until professor sign-off).
  const [zoneFilter, setZoneFilter] = useState('all');
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [activeSegment, setActiveSegment] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [selectedRiderId, setSelectedRiderId] = useState(null);
  const [selectedTrackingId, setSelectedTrackingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const mapSectionRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [rData, pData, locData] = await Promise.all([
        ridersApi.list(),
        parcelsApi.list(),
        parcelLocationsApi.list().catch(() => []),
      ]);

      const locMap = {};
      (Array.isArray(locData) ? locData : []).forEach(loc => {
        const lat = parseFloat(loc.lat);
        const lng = parseFloat(loc.lng);
        if (loc.parcelId && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          locMap[loc.parcelId.toUpperCase()] = { lat, lng };
        }
      });

      const safeParcels = Array.isArray(pData) ? pData : [];

      // Only active riders with honesty on coordinates and telemetry fix
      const activeRiders = (Array.isArray(rData) ? rData : [])
        .filter(r => {
          const s = (r.status || 'active').toLowerCase();
          return s !== 'archived' && s !== 'inactive';
        })
        .map((r, i) => {
          const coords = CITY_COORDS[r.city];
          const rReg = r.registrationId ? String(r.registrationId) : '';
          const rMongoId = r._id ? String(r._id) : '';
          const matchRider = (pRider) => {
            if (!pRider) return false;
            const pid = typeof pRider === 'object' ? String(pRider._id || pRider.registrationId || '') : String(pRider);
            return (rReg && pid === rReg) || (rMongoId && pid === rMongoId);
          };
          const riderParcelsWithFix = safeParcels
            .filter(p => matchRider(p.riderId || p.rider) && locMap[(p.trackingNumber || p.trackingId || '').toUpperCase()])
            .sort((a, b) => (IN_FLIGHT_WEIGHT[String(b.status || '').toLowerCase()] ?? 0) - (IN_FLIGHT_WEIGHT[String(a.status || '').toLowerCase()] ?? 0));
          const heldParcelWithFix = riderParcelsWithFix[0] || null;
          // A fresh GPS ping from the rider app wins; then lastLocation fix; then a parcel's location; then the city.
          const ping = getFreshPing(r);
          const lastLoc = r.lastLocation;
          const hasLastLoc = lastLoc && Number.isFinite(Number(lastLoc.lat)) && Number.isFinite(Number(lastLoc.lng));
          const fix = ping || (hasLastLoc ? { lat: Number(lastLoc.lat), lng: Number(lastLoc.lng) } : null) || (heldParcelWithFix ? locMap[(heldParcelWithFix.trackingNumber || heldParcelWithFix.trackingId || '').toUpperCase()] : null);
          const lat = fix ? fix.lat : (coords ? coords.lat + (i * 0.002) : LOGISTICS_HUBS[0].coordinates.lat + (i * 0.004));
          const lng = fix ? fix.lng : (coords ? coords.lng + (i * 0.002) : LOGISTICS_HUBS[0].coordinates.lng + (i * 0.003));

          return {
            id: r.registrationId || r._id,
            _id: r._id,
            name: r.riderName || '—',
            phone: r.phone || '',
            vehicle: r.vehicleType || '',
            status: r.status || 'Active',
            city: r.city || '',
            province: r.province || '',
            barangay: r.barangay || '',
            lat,
            lng,
            hasRealGps: !!fix,
            livePosition: ping ? formatLivePosition(ping.lat, ping.lng) : '',
            battery: null,
            speed: null,
          };
        });

      // Active parcels with coordinates prioritization
      const activeParcels = safeParcels
        .filter(p => !isFinishedParcelStatus(p.status))
        .map((p, i) => {
          const tn = (p.trackingNumber || p.trackingId || '').toUpperCase();
          const fix = locMap[tn];
          const resolved = resolveParcelCurrentLocation(p);
          let lat, lng;
          if (resolved.lat !== null && resolved.lng !== null) {
            lat = Number(resolved.lat);
            lng = Number(resolved.lng);
          } else if (fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lng)) {
            lat = fix.lat;
            lng = fix.lng;
          } else {
            const destCoords = CITY_COORDS[p.destination];
            const origCoords = CITY_COORDS[p.origin];
            lat = destCoords ? destCoords.lat + (i * 0.002) : origCoords ? origCoords.lat + (i * 0.002) : LOGISTICS_HUBS[0].coordinates.lat + (i * 0.004);
            lng = destCoords ? destCoords.lng + (i * 0.002) : origCoords ? origCoords.lng + (i * 0.002) : LOGISTICS_HUBS[0].coordinates.lng + (i * 0.003);
          }
          return {
            ...p,
            lat,
            lng,
          };
        });

      setRiders(activeRiders);
      setParcels(activeParcels);
    } catch (err) {
      console.error('Error fetching geofence data:', err);
      setRiders([]);
      setParcels([]);
    } finally {
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshTrigger(prev => prev + 1);
    try {
      await fetchData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const { on } = useSSE();
  useEffect(() => {
    const unsub1 = on('location-synced', () => fetchData());
    const unsub2 = on('parcel-synced', () => fetchData());
    const unsub3 = on('parcel-updated', () => fetchData());
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on, fetchData]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, LIVE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const vehicleTypes = useMemo(() => {
    const set = new Set(riders.map(r => r.vehicle).filter(Boolean));
    return Array.from(set);
  }, [riders]);

  // Canonical municipality options from the delivery zone directory
  // (scoped by the selected zone); the directory always offers real
  // Bulacan towns even when live data is sparse.
  const availableCities = useMemo(() => {
    if (zoneFilter === 'all') return ALL_MUNICIPALITIES.slice();
    return municipalitiesOf(zoneFilter);
  }, [zoneFilter]);

  // Barangay options for the picked municipality. Empty for the 21/24
  // towns whose mapping is still pending professor sign-off — the
  // dropdown is hidden in that case.
  const availableBarangays = useMemo(() => {
    if (locationFilter === 'all') return [];
    return barangaysOf(locationFilter);
  }, [locationFilter]);

  // Operational breakdown counts
  const insideHubCount = useMemo(() => {
    return riders.filter(r => {
      const dist = haversineKm(r.lat, r.lng, LOGISTICS_HUBS[0].coordinates.lat, LOGISTICS_HUBS[0].coordinates.lng);
      return dist <= LOGISTICS_HUBS[0].geofenceRadius;
    }).length;
  }, [riders]);

  const outsideHubCount = useMemo(() => {
    return Math.max(0, riders.length - insideHubCount);
  }, [riders, insideHubCount]);

  const withShipmentsCount = useMemo(() => {
    return riders.filter(r => parcels.some(p => p.riderId === r.id || p.riderId === r._id)).length;
  }, [riders, parcels]);

  const idleCount = useMemo(() => {
    return Math.max(0, riders.length - withShipmentsCount);
  }, [riders, withShipmentsCount]);

  const liveFixCount = useMemo(() => {
    return riders.filter(r => r.hasRealGps).length;
  }, [riders]);

  const filteredRiders = useMemo(() => {
    const q = riderSearch.toLowerCase().trim();
    return riders.filter(r => {
      if (q) {
        const rParcels = parcels.filter(p => p.riderId === r.id || p.riderId === r._id);
        const hasMatchingParcel = rParcels.some(p => (p.trackingNumber || p.trackingId || '').toLowerCase().includes(q));
        const match =
          r.name?.toLowerCase().includes(q) ||
          String(r.id || '').toLowerCase().includes(q) ||
          r.phone?.includes(q) ||
          r.vehicle?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.province?.toLowerCase().includes(q) ||
          hasMatchingParcel;
        if (!match) return false;
      }

      if (vehicleFilter !== 'all' && r.vehicle !== vehicleFilter) return false;
      if (locationFilter !== 'all') {
        const rTown = extractMunicipality(r.city) || extractMunicipality(r.province) || (r.city || '').trim();
        const rParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const hasParcelInTown = rParcels.some(p => {
          const origTown = extractMunicipality(p.origin);
          const destTown = extractMunicipality(p.destination);
          return origTown === locationFilter || destTown === locationFilter;
        });
        if (rTown !== locationFilter && !hasParcelInTown) return false;
      }

      if (zoneFilter !== 'all') {
        const rZone = zoneForMunicipality(extractMunicipality(r.city) || extractMunicipality(r.province));
        const rParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const hasParcelInZone = rParcels.some(p =>
          zoneForMunicipality(extractMunicipality(p.origin)) === zoneFilter ||
          zoneForMunicipality(extractMunicipality(p.destination)) === zoneFilter
        );
        if (rZone !== zoneFilter && !hasParcelInZone) return false;
      }

      if (barangayFilter !== 'all') {
        const rParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const hasParcelInBrgy = rParcels.some(p =>
          sameBarangay(extractBarangayFromAddress(p.origin), barangayFilter) ||
          sameBarangay(extractBarangayFromAddress(p.destination), barangayFilter)
        );
        if (!sameBarangay(r.barangay, barangayFilter) && !hasParcelInBrgy) return false;
      }

      if (signalFilter !== 'all') {
        if (signalFilter === 'live' && !r.hasRealGps) return false;
        if (signalFilter === 'approx' && r.hasRealGps) return false;
      }

      // Quick Segment Tabs
      const dist = haversineKm(r.lat, r.lng, LOGISTICS_HUBS[0].coordinates.lat, LOGISTICS_HUBS[0].coordinates.lng);
      const isInside = dist <= LOGISTICS_HUBS[0].geofenceRadius;
      const courierParcels = parcels.filter(p => p.riderId === r.id || p.riderId === r._id);

      if (activeSegment === 'inside' && !isInside) return false;
      if (activeSegment === 'outside' && isInside) return false;
      if (activeSegment === 'with-parcels' && courierParcels.length === 0) return false;
      if (activeSegment === 'idle' && courierParcels.length > 0) return false;

      return true;
    });
  }, [riders, parcels, riderSearch, vehicleFilter, locationFilter, zoneFilter, barangayFilter, signalFilter, activeSegment]);

  const paginatedRiders = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRiders.slice(start, start + rowsPerPage);
  }, [filteredRiders, currentPage, rowsPerPage]);

  const hasActiveFilters = riderSearch || vehicleFilter !== 'all' || zoneFilter !== 'all' || locationFilter !== 'all' || barangayFilter !== 'all' || signalFilter !== 'all' || activeSegment !== 'all';

  const handleClearFilters = () => {
    setRiderSearch('');
    setVehicleFilter('all');
    setZoneFilter('all');
    setLocationFilter('all');
    setBarangayFilter('all');
    setSignalFilter('all');
    setActiveSegment('all');
    setCurrentPage(1);
  };

  const handleLocateRider = (riderId, trackingNumber = null) => {
    setSelectedRiderId(prev => (prev === riderId && !trackingNumber ? null : riderId));
    setSelectedTrackingId(trackingNumber);
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCopy = (id) => {
    if (!id) return;
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExportRiders = (format) => {
    const data = filteredRiders.map((r) => {
      const courierParcels = parcels.filter((p) => p.riderId === r.id || p.riderId === r._id);
      const distToHub = haversineKm(
        r.lat,
        r.lng,
        LOGISTICS_HUBS[0].coordinates.lat,
        LOGISTICS_HUBS[0].coordinates.lng
      );
      const isInside = distToHub <= LOGISTICS_HUBS[0].geofenceRadius;
      return {
        id: r.id,
        name: r.name,
        phone: r.phone || '—',
        vehicle: r.vehicle,
        location: r.livePosition || [r.barangay, r.city, r.province].filter(Boolean).join(', ') || '—',
        signal: r.hasRealGps ? 'Live GPS Ping' : 'City Approximation',
        packagesCount: courierParcels.length,
        proximity: `${distToHub.toFixed(1)} km to hub`,
        boundary: isInside ? 'Inside Hub Geofence' : 'Outside Hub Geofence',
        dutyStatus: (r.status || 'Active').toLowerCase() === 'active' ? 'On Duty' : 'Off Duty',
      };
    });
    const filename = `active_riders_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'excel') {
      exportToExcel(data, RIDER_EXPORT_COLUMNS, filename);
    } else if (format === 'word') {
      exportToWord(data, RIDER_EXPORT_COLUMNS, filename, 'Active Riders Geofence Report');
    } else if (format === 'pdf') {
      exportToPDF(data, RIDER_EXPORT_COLUMNS, filename, 'Active Riders Geofence Report');
    } else {
      exportToCSV(data, RIDER_EXPORT_COLUMNS, filename);
    }
  };

  const segmentTabs = [
    { id: 'all', label: 'All', count: riders.length },
    { id: 'inside', label: 'Inside Geofence', count: insideHubCount },
    { id: 'outside', label: 'Outside Geofence', count: outsideHubCount },
    { id: 'with-parcels', label: 'Carrying Shipments', count: withShipmentsCount },
    { id: 'idle', label: 'Available / Idle', count: idleCount },
  ];

  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', backgroundColor: '#f0ecf7', minHeight: '100vh', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}} @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1}} .leaflet-popup-content-wrapper{border-radius:10px!important;box-shadow:0 8px 24px rgba(0,0,0,.14)!important;}`}</style>

      <PageHeader
        title="Geofence Monitor"
        subtitle="Live GPS tracking, proximity boundaries, and regional rider dispatch monitoring"
        breadcrumb={['Dashboard', 'Tracking & Maps', 'Geofence Monitor']}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {lastUpdated && <span className="text-[11px] text-slate-400 font-mono">Updated {lastUpdated}</span>}
            <RefreshButton
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          </div>
        }
      />

      <div className="space-y-6">
        {/* Live Rider Map Section with External Selection Support */}
        <div ref={mapSectionRef} className="scroll-mt-4">
          <LiveRiderMap
            externalSelectedRiderId={selectedRiderId}
            externalSelectedTrackingId={selectedTrackingId}
            onSelectRider={(id) => { setSelectedRiderId(id); setSelectedTrackingId(null); }}
            onSelectTracking={setSelectedTrackingId}
            refreshTrigger={refreshTrigger}
            activeRidersCount={riders.length}
            activeShipmentsCount={parcels.length}
          />
        </div>

        {/* Enhanced Active Riders Container. The data-testid attributes in the
            table below are invisible hooks for the Playwright tests in e2e/. */}
        <SectionCard
          noPadding
          icon={Bike}
          title="Active Riders on Map"
          subtitle={`${filteredRiders.length} of ${riders.length} active riders displayed — live geofence proximity, signal status, and route dispatch`}
          actions={
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* View Mode Toggle: Table vs Dispatch Cards */}
              <div className="flex items-center gap-1.5 bg-[#f6f2fa] p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'table'
                      ? 'bg-white text-[#390955] border border-[#e4d8f2]'
                      : 'text-slate-600 hover:text-[#390955] hover:bg-white/60 border border-transparent'
                  }`}
                  title="Table Ledger View"
                >
                  <List size={13} aria-hidden="true" /> Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#390955] border border-[#e4d8f2]'
                      : 'text-slate-600 hover:text-[#390955] hover:bg-white/60 border border-transparent'
                  }`}
                  title="Dispatch Grid Cards View"
                >
                  <LayoutGrid size={13} aria-hidden="true" /> Grid
                </button>
              </div>
            </div>
          }
          footer={
            <CardFooter
              resultsLabel={`Showing ${paginatedRiders.length} of ${filteredRiders.length} active riders`}
              pills={[
                { label: 'Live GPS Pings', value: liveFixCount, tone: 'green' },
                { label: 'Approximate Fixes', value: Math.max(0, riders.length - liveFixCount), tone: 'amber' },
              ]}
            />
          }
        >
          {/* Quick Segment Filter Chips Strip */}
          <div className="px-6 py-2.5 border-b border-[#f0eaf8] bg-[#faf8fc] flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Dispatch Segments:
            </span>
            {segmentTabs.map(tab => {
              const active = activeSegment === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveSegment(tab.id); setCurrentPage(1); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#390955] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-[#e8e0f0]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Standardized FilterBar */}
          <FilterBar>
            <FilterBar.Group>
              <FilterBar.Search
                placeholder="Search rider, city, vehicle, tracking..."
                value={riderSearch}
                onChange={e => { setRiderSearch(e.target.value); setCurrentPage(1); }}
                width="w-64 sm:w-72"
              />

              <FilterBar.Select
                aria-label="Filter by vehicle type"
                value={vehicleFilter}
                onChange={e => { setVehicleFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="all">All</option>
                {vehicleTypes.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </FilterBar.Select>

              <FilterBar.Select
                aria-label="Filter by telemetry signal"
                value={signalFilter}
                onChange={e => { setSignalFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="all">All Telemetry Signals</option>
                <option value="live">Live GPS Pings Only</option>
                <option value="approx">Approximate Fixes Only</option>
              </FilterBar.Select>

              <FilterBar.Select
                aria-label="Filter by delivery zone"
                value={zoneFilter}
                onChange={e => { setZoneFilter(e.target.value); setLocationFilter('all'); setBarangayFilter('all'); setCurrentPage(1); }}
              >
                <option value="all">All Zones</option>
                {allZoneIds().map(z => (
                  <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                ))}
              </FilterBar.Select>

              {availableCities.length > 0 && (
                <FilterBar.Select
                  aria-label="Filter by city location"
                  value={locationFilter}
                  onChange={e => { setLocationFilter(e.target.value); setBarangayFilter('all'); setCurrentPage(1); }}
                >
                  <option value="all">All</option>
                  {availableCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </FilterBar.Select>
              )}

              {availableBarangays.length > 0 && (
                <FilterBar.Select
                  aria-label="Filter by barangay"
                  value={barangayFilter}
                  onChange={e => { setBarangayFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">All Barangays</option>
                  {availableBarangays.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </FilterBar.Select>
              )}

              <FilterBar.Count count={filteredRiders.length} label="riders" />
            </FilterBar.Group>

            <FilterBar.Actions>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                >
                  <X size={13} aria-hidden="true" /> Clear Filters
                </button>
              )}
              <ExportDropdown
                onExport={handleExportRiders}
                disabled={filteredRiders.length === 0}
              />
            </FilterBar.Actions>
          </FilterBar>

          {/* Body Content: Empty State vs. Table View vs. Grid Cards View */}
          {riders.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Bike}
                title="No Active Riders"
                description="No riders are currently reporting active on-duty status."
              />
            </div>
          ) : filteredRiders.length === 0 ? (
            <div className="py-12 px-4">
              <EmptyState
                title="No Riders Match Filter"
                description="No active riders match your current search and filter criteria. Try resetting or adjusting your filter selection."
                action={
                  <button
                    onClick={handleClearFilters}
                    className="h-[34px] px-3.5 bg-[#390955] text-white text-xs font-bold rounded-lg hover:brightness-110 cursor-pointer"
                  >
                    Clear Filters
                  </button>
                }
              />
            </div>
          ) : viewMode === 'table' ? (
            /* 1. TABLE VIEW */
            <div className="p-4 space-y-4">
              <DataTable>
                <DataTable.Head>
                  <tr>
                    {TABLE_HEADERS.map((h, i) => (
                      <DataTable.Th key={i} sticky={h.sticky} align={h.align}>
                        <span className="inline-flex items-center gap-1.5">
                          {h.icon && <h.icon size={13} className="text-purple-600" aria-hidden="true" />}
                          {h.label}
                        </span>
                      </DataTable.Th>
                    ))}
                  </tr>
                </DataTable.Head>
                <tbody>
                  {paginatedRiders.map((r) => {
                    const qSearch = riderSearch.toLowerCase().trim();
                    const courierParcels = parcels
                      .filter(p => p.riderId === r.id || p.riderId === r._id)
                      .sort((a, b) => {
                        const aTn = (a.trackingNumber || a.trackingId || '').toLowerCase();
                        const bTn = (b.trackingNumber || b.trackingId || '').toLowerCase();
                        const aMatches = qSearch && aTn.includes(qSearch);
                        const bMatches = qSearch && bTn.includes(qSearch);
                        if (aMatches && !bMatches) return -1;
                        if (!aMatches && bMatches) return 1;
                        return (IN_FLIGHT_WEIGHT[String(b.status || '').toLowerCase()] ?? 0) - (IN_FLIGHT_WEIGHT[String(a.status || '').toLowerCase()] ?? 0);
                      });
                    const distToHub = haversineKm(
                      r.lat,
                      r.lng,
                      LOGISTICS_HUBS[0].coordinates.lat,
                      LOGISTICS_HUBS[0].coordinates.lng
                    );
                    const isInsideHubGeofence = distToHub <= LOGISTICS_HUBS[0].geofenceRadius;
                    const isSelected = selectedRiderId === r.id;

                    return (
                      <DataTable.Row key={r.id} className={isSelected ? 'bg-purple-50/60 ring-1 ring-purple-300' : ''}>
                        {/* 1. Rider ID */}
                        <DataTable.Cell sticky>
                          <div className="flex items-center gap-1.5">
                            <span data-testid={`rider-id-${r.id}`} className="font-mono font-bold text-xs text-[#f37021]">
                              {r.id}
                            </span>
                            <button
                              onClick={() => handleCopy(r.id)}
                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-[#390955] hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Copy Rider ID"
                            >
                              {copiedId === r.id ? (
                                <Check size={11} className="text-emerald-600" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </div>
                        </DataTable.Cell>

                        {/* 2. Rider Name */}
                        <DataTable.Cell className="font-bold text-slate-800">
                          <span className="inline-flex items-center gap-1.5 text-[#390955]">
                            <VehicleIcon type={r.vehicle} size={15} /> {r.name}
                          </span>
                        </DataTable.Cell>

                        {/* 3. Vehicle & Signal */}
                        <DataTable.Cell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-slate-700 text-xs font-semibold">{r.vehicle}</span>
                            <span data-testid={`rider-signal-${r.id}`} className={`inline-flex items-center gap-1 text-[10px] font-semibold ${r.hasRealGps ? 'text-emerald-700' : 'text-amber-700'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.hasRealGps ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {r.hasRealGps ? 'Live GPS Ping' : 'Approximate'}
                            </span>
                          </div>
                        </DataTable.Cell>

                        {/* 4. Current Location */}
                        <DataTable.Cell>
                          <span data-testid={`rider-location-${r.id}`} className="text-slate-700 text-xs font-medium">
                            {r.livePosition || [r.barangay, r.city, r.province].filter(Boolean).join(', ') || '—'}
                          </span>
                        </DataTable.Cell>

                        {/* 5. Assigned Shipments — simple dropdown listing every claimed parcel */}
                        <DataTable.Cell>
                          {courierParcels.length === 0 ? (
                            <span className="text-slate-400 font-normal text-xs">Available (0)</span>
                          ) : (
                            <select
                              className="max-w-[175px] cursor-pointer rounded border border-orange-200 bg-[#fbf7f0] px-1.5 py-0.5 font-mono text-xs font-semibold text-[#f37021] hover:bg-[#faebd7] focus:outline-none focus:ring-2 focus:ring-orange-300"
                              aria-label={`Assigned shipments for ${r.riderName || r.id}`}
                              title="All shipments claimed by this rider"
                              value={
                                selectedTrackingId &&
                                courierParcels.some(
                                  (p) => (p.trackingNumber || p.trackingId) === selectedTrackingId
                                )
                                  ? selectedTrackingId
                                  : ''
                              }
                              onChange={(e) => {
                                const tn = e.target.value;
                                if (tn) handleLocateRider(r.id, tn);
                              }}
                            >
                              <option value="" disabled>
                                Shipments ({courierParcels.length})
                              </option>
                              {courierParcels.map((p) => {
                                const tn = p.trackingNumber || p.trackingId;
                                return (
                                  <option key={tn} value={tn}>
                                    {tn}
                                    {p.status ? ` — ${p.status}` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </DataTable.Cell>

                        {/* 6. Hub Proximity & Boundary */}
                        <DataTable.Cell>
                          <div className="flex flex-col gap-0.5">
                            <div data-testid={`rider-boundary-${r.id}`}>
                              <Badge tone={isInsideHubGeofence ? 'purple' : 'amber'}>
                                {isInsideHubGeofence ? 'Inside Geofence' : 'Outside Geofence'}
                              </Badge>
                            </div>
                            <span data-testid={`rider-distance-${r.id}`} className="text-[10px] font-mono text-slate-500">
                              {distToHub < 1 ? `${Math.round(distToHub * 1000)} m to hub` : `${distToHub.toFixed(1)} km to hub`}
                            </span>
                          </div>
                        </DataTable.Cell>

                        {/* 8. Actions */}
                        <DataTable.Cell align="right">
                          <button
                            type="button"
                            onClick={() => handleLocateRider(r.id)}
                            className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#390955] text-white ring-2 ring-purple-400'
                                : 'bg-[#f0eaf8] text-[#390955] hover:bg-[#e4d6f3]'
                            }`}
                            title="Locate and focus rider on live map"
                          >
                            <Navigation size={12} aria-hidden="true" />
                            {isSelected ? 'Viewing' : 'Locate'}
                          </button>
                        </DataTable.Cell>
                      </DataTable.Row>
                    );
                  })}
                </tbody>
              </DataTable>

              {filteredRiders.length > 0 && (
                <div className="pt-2">
                  <PaginationControls
                    currentPage={currentPage}
                    totalRecords={filteredRiders.length}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[10, 25, 50]}
                    onPageChange={setCurrentPage}
                    onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
                  />
                </div>
              )}
            </div>
          ) : (
            /* 2. DISPATCH GRID / CARDS VIEW */
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedRiders.map((r) => {
                  const courierParcels = parcels.filter(p => p.riderId === r.id || p.riderId === r._id);
                  const distToHub = haversineKm(
                    r.lat,
                    r.lng,
                    LOGISTICS_HUBS[0].coordinates.lat,
                    LOGISTICS_HUBS[0].coordinates.lng
                  );
                  const isInsideHubGeofence = distToHub <= LOGISTICS_HUBS[0].geofenceRadius;
                  const isSelected = selectedRiderId === r.id;

                  return (
                    <div
                      key={r.id}
                      className={`relative p-4 rounded-xl border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#390955] bg-purple-50/40 shadow-md ring-2 ring-[#390955]/20'
                          : 'border-[#e8e2f0] bg-white hover:border-[#390955] hover:shadow-sm'
                      }`}
                    >
                      <div>
                        {/* Card Top: Icon, Rider Name & Status */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-[#f0eaf8] flex items-center justify-center text-[#390955] shrink-0 border border-[#ede4f5]">
                              <VehicleIcon type={r.vehicle} size={18} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold text-[#1a1a1a] truncate">
                                {r.name}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-[#f37021] mt-0.5">
                                <span>{r.id}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(r.id)}
                                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-600"
                                  title="Copy Rider ID"
                                >
                                  {copiedId === r.id ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
                                </button>
                              </div>
                            </div>
                          </div>

                          <Badge tone={isInsideHubGeofence ? 'purple' : 'amber'}>
                            {isInsideHubGeofence ? 'Inside Geofence' : 'In Transit'}
                          </Badge>
                        </div>

                        {/* Telemetry specs strip */}
                        <div className="space-y-2 mb-3 text-xs bg-[#faf8fc]/80 p-2.5 rounded-lg border border-[#ede7f4]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 font-semibold">Location:</span>
                            <span className="text-slate-700 font-medium truncate max-w-[170px]">
                              {r.livePosition || [r.city, r.province].filter(Boolean).join(', ') || '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 font-semibold">Hub Distance:</span>
                            <span className="font-mono font-bold text-purple-800">
                              {distToHub < 1 ? `${Math.round(distToHub * 1000)} m to hub` : `${distToHub.toFixed(1)} km to hub`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 font-semibold">Signal Quality:</span>
                            <span className={`inline-flex items-center gap-1 font-semibold ${r.hasRealGps ? 'text-emerald-700' : 'text-amber-700'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.hasRealGps ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {r.hasRealGps ? 'Live GPS Ping' : 'Approximate'}
                            </span>
                          </div>
                        </div>

                        {/* Assigned Shipments */}
                        <div className="pt-2 border-t border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                            <span>Assigned Shipments</span>
                            <span className="font-mono text-[#390955] font-bold">{courierParcels.length}</span>
                          </div>
                          {courierParcels.length === 0 ? (
                            <span className="text-xs text-slate-400">Available (0)</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {courierParcels.map((p, idx) => {
                                const tn = p.trackingNumber || p.trackingId;
                                const isFocused = selectedTrackingId === tn;
                                const qSearch = riderSearch.toLowerCase().trim();
                                const isSearchMatch = qSearch && tn.toLowerCase().includes(qSearch);
                                if (idx > 1 && !isSearchMatch && !isFocused) return null;
                                return (
                                  <button
                                    key={p._id || tn}
                                    type="button"
                                    onClick={() => handleLocateRider(r.id, tn)}
                                    title={`Click to focus shipment ${tn} on map`}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all ${
                                      isFocused
                                        ? 'bg-[#f37021] text-white ring-2 ring-orange-300'
                                        : isSearchMatch
                                        ? 'bg-amber-100 text-amber-900 border border-amber-400'
                                        : 'bg-orange-50 text-[#f37021] hover:bg-orange-100 border border-orange-200'
                                    }`}
                                  >
                                    <Package size={10} /> {tn}
                                  </button>
                                );
                              })}
                              {courierParcels.length > 2 && (
                                <Tooltip content={courierParcels.slice(2).map(p => p.trackingNumber || p.trackingId).join(', ')}>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f0eaf8] text-[#390955] cursor-pointer">
                                    +{courierParcels.length - 2} more
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Action */}
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleLocateRider(r.id)}
                          className={`w-full inline-flex items-center justify-center gap-1.5 h-[34px] px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#390955] text-white ring-2 ring-purple-400'
                              : 'bg-[#f0eaf8] text-[#390955] hover:bg-[#e4d6f3]'
                          }`}
                        >
                          <Navigation size={12} aria-hidden="true" />
                          {isSelected ? 'Viewing on Map' : 'Locate on Map'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredRiders.length > 0 && (
                <div className="pt-2">
                  <PaginationControls
                    currentPage={currentPage}
                    totalRecords={filteredRiders.length}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[10, 25, 50]}
                    onPageChange={setCurrentPage}
                    onRowsPerPageChange={(n) => { setRowsPerPage(n); setCurrentPage(1); }}
                  />
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}