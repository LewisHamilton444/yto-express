import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LiveRiderMap from './LiveRiderMap';
import { CITY_COORDS } from './luzonCityCoords';
import { LOGISTICS_HUBS, haversineKm } from './hubGeofenceData';
import { ridersApi, parcelsApi, parcelLocationsApi } from './services/api';
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
  const [activeSegment, setActiveSegment] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [selectedRiderId, setSelectedRiderId] = useState(null);
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
          // Check if any parcel assigned to this courier has a real GPS fix in locMap
          const heldParcelWithFix = safeParcels.find(
            p => (p.riderId === (r.registrationId || r._id)) && locMap[(p.trackingNumber || p.trackingId || '').toUpperCase()]
          );
          const fix = heldParcelWithFix ? locMap[(heldParcelWithFix.trackingNumber || heldParcelWithFix.trackingId || '').toUpperCase()] : null;
          const lat = fix ? fix.lat : (coords ? coords.lat + (i * 0.002) : LOGISTICS_HUBS[0].coordinates.lat + (i * 0.004));
          const lng = fix ? fix.lng : (coords ? coords.lng + (i * 0.002) : LOGISTICS_HUBS[0].coordinates.lng + (i * 0.003));

          return {
            id: r.registrationId || r._id,
            _id: r._id,
            name: r.riderName || '—',
            phone: r.phone || '',
            vehicle: r.vehicleType || 'Motorcycle',
            status: r.status || 'Active',
            city: r.city || '',
            province: r.province || '',
            barangay: r.barangay || '',
            lat,
            lng,
            hasRealGps: !!fix,
            battery: null,
            speed: null,
          };
        });

      // Active parcels with coordinates prioritization
      const activeParcels = safeParcels
        .filter(p => !['delivered', 'returned', 'failed'].includes(String(p.status || '').toLowerCase()))
        .map((p, i) => {
          const tn = (p.trackingNumber || p.trackingId || '').toUpperCase();
          const fix = locMap[tn];
          const center = p.trackingGeofence?.center;
          let lat, lng;
          if (fix) {
            lat = fix.lat;
            lng = fix.lng;
          } else if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
            lat = center.lat;
            lng = center.lng;
          } else if (Number.isFinite(p.riderLat) && Number.isFinite(p.riderLng) && !(p.riderLat === 0 && p.riderLng === 0)) {
            lat = p.riderLat;
            lng = p.riderLng;
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
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const inTransitCount = useMemo(() => {
    return parcels.filter(p => {
      const s = (p.status || '').toLowerCase();
      return s.includes('transit') || s.includes('delivery') || s.includes('picked');
    }).length;
  }, [parcels]);

  const realGpsFixCount = useMemo(() => {
    return parcels.filter(p => {
      return (Number.isFinite(p.riderLat) && Number.isFinite(p.riderLng) && !(p.riderLat === 0 && p.riderLng === 0)) ||
        (p.trackingGeofence?.center?.lat && p.trackingGeofence?.center?.lng);
    }).length;
  }, [parcels]);

  const vehicleTypes = useMemo(() => {
    const set = new Set(riders.map(r => r.vehicle).filter(Boolean));
    return Array.from(set);
  }, [riders]);

  const availableCities = useMemo(() => {
    const set = new Set(riders.map(r => r.city).filter(Boolean));
    return Array.from(set).sort();
  }, [riders]);

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
      if (locationFilter !== 'all' && r.city !== locationFilter) return false;

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
  }, [riders, parcels, riderSearch, vehicleFilter, locationFilter, signalFilter, activeSegment]);

  const paginatedRiders = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRiders.slice(start, start + rowsPerPage);
  }, [filteredRiders, currentPage, rowsPerPage]);

  const hasActiveFilters = riderSearch || vehicleFilter !== 'all' || locationFilter !== 'all' || signalFilter !== 'all' || activeSegment !== 'all';

  const handleClearFilters = () => {
    setRiderSearch('');
    setVehicleFilter('all');
    setLocationFilter('all');
    setSignalFilter('all');
    setActiveSegment('all');
    setCurrentPage(1);
  };

  const handleLocateRider = (riderId) => {
    setSelectedRiderId(prev => (prev === riderId ? null : riderId));
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
        location: [r.barangay, r.city, r.province].filter(Boolean).join(', ') || '—',
        signal: r.hasRealGps ? 'Live GPS Ping' : 'City Approximation',
        packagesCount: courierParcels.length,
        proximity: `${distToHub.toFixed(1)} km to hub`,
        boundary: isInside ? 'Inside Hub Geofence' : 'Outside Hub Boundary (In Transit)',
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
    { id: 'outside', label: 'In Transit', count: outsideHubCount },
    { id: 'with-parcels', label: 'Carrying Shipments', count: withShipmentsCount },
    { id: 'idle', label: 'Available / Idle', count: idleCount },
  ];

  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', backgroundColor: '#f0ecf7', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
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
            onSelectRider={setSelectedRiderId}
            refreshTrigger={refreshTrigger}
            activeRidersCount={riders.length}
            activeShipmentsCount={parcels.length}
          />
        </div>

        {/* Enhanced Active Riders Container */}
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
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'table'
                      ? 'bg-white text-[#390955] shadow-xs border border-[#e4d8f2]'
                      : 'text-slate-600 hover:text-[#390955] hover:bg-white/60 border border-transparent'
                  }`}
                  title="Table Ledger View"
                >
                  <List size={13} aria-hidden="true" /> Table
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#390955] shadow-xs border border-[#e4d8f2]'
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

              {availableCities.length > 0 && (
                <FilterBar.Select
                  aria-label="Filter by city location"
                  value={locationFilter}
                  onChange={e => { setLocationFilter(e.target.value); setCurrentPage(1); }}
                >
                  <option value="all">All</option>
                  {availableCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </FilterBar.Select>
              )}

              <FilterBar.Count count={filteredRiders.length} label="riders" />
            </FilterBar.Group>

            <FilterBar.Actions>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-[#475569] text-xs font-bold border border-[#cbd5e1] hover:brightness-105 active:scale-95 transition-all shadow-xs cursor-pointer"
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
                    className="h-[34px] px-3.5 bg-[#390955] text-white text-xs font-bold rounded-lg hover:brightness-110 cursor-pointer shadow-sm"
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
                      <DataTable.Row key={r.id} className={isSelected ? 'bg-purple-50/60 ring-1 ring-purple-300' : ''}>
                        {/* 1. Rider ID */}
                        <DataTable.Cell sticky>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-xs text-[#f37021]">
                              {r.id}
                            </span>
                            <button
                              onClick={() => handleCopy(r.id)}
                              className="p-1 rounded text-slate-400 hover:text-[#390955] hover:bg-slate-100 transition-colors cursor-pointer"
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
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${r.hasRealGps ? 'text-emerald-700' : 'text-amber-700'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.hasRealGps ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              {r.hasRealGps ? 'Live GPS Ping' : 'Approximate'}
                            </span>
                          </div>
                        </DataTable.Cell>

                        {/* 4. Current Location */}
                        <DataTable.Cell>
                          <span className="text-slate-700 text-xs font-medium">
                            {[r.barangay, r.city, r.province].filter(Boolean).join(', ') || '—'}
                          </span>
                        </DataTable.Cell>

                        {/* 5. Assigned Shipments */}
                        <DataTable.Cell>
                          {courierParcels.length === 0 ? (
                            <span className="text-slate-400 font-normal text-xs">Available (0)</span>
                          ) : courierParcels.length === 1 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#f37021] text-xs font-mono">
                              <Package size={12} aria-hidden="true" />
                              {courierParcels[0].trackingNumber || courierParcels[0].trackingId}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-semibold text-[#f37021] text-xs font-mono">
                                <Package size={12} aria-hidden="true" />
                                {courierParcels[0].trackingNumber || courierParcels[0].trackingId}
                              </span>
                              <Tooltip content={courierParcels.map(p => p.trackingNumber || p.trackingId).join(', ')}>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f0eaf8] text-[#390955] cursor-pointer">
                                  +{courierParcels.length - 1} more
                                </span>
                              </Tooltip>
                            </div>
                          )}
                        </DataTable.Cell>

                        {/* 6. Hub Proximity & Boundary */}
                        <DataTable.Cell>
                          <div className="flex flex-col gap-0.5">
                            <div>
                              <Badge tone={isInsideHubGeofence ? 'purple' : 'amber'}>
                                {isInsideHubGeofence ? 'Inside Geofence' : 'In Transit'}
                              </Badge>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">
                              {distToHub < 1 ? `${Math.round(distToHub * 1000)} m to hub` : `${distToHub.toFixed(1)} km to hub`}
                            </span>
                          </div>
                        </DataTable.Cell>

                        {/* 8. Actions */}
                        <DataTable.Cell align="right">
                          <button
                            type="button"
                            onClick={() => handleLocateRider(r.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
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
                                  className="text-slate-400 hover:text-slate-600 p-0.5"
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
                              {[r.city, r.province].filter(Boolean).join(', ') || '—'}
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
                              {courierParcels.slice(0, 2).map(p => (
                                <span key={p._id || p.trackingNumber} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-orange-50 text-[#f37021] border border-orange-200">
                                  <Package size={10} /> {p.trackingNumber || p.trackingId}
                                </span>
                              ))}
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
                          className={`w-full inline-flex items-center justify-center gap-1.5 h-[34px] px-3 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm ${
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