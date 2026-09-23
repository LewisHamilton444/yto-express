import React, { useState, useEffect, useRef, useCallback } from 'react';
import { normalizeRider, RIDER_STATUS } from './sellerRiderData';
import { ridersApi } from './services/api';
import { VehicleIcon } from './components/ui/vehicleIcons';
import { vehicleGlyphSvg } from './components/ui/vehicleIconUtils';
import { Archive, RotateCcw } from 'lucide-react';
import PageHeader from './components/ui/PageHeader';
import RefreshButton from './components/ui/RefreshButton';
import FilterBar from './components/ui/FilterBar';
import Modal from './components/ui/Modal';
import EmptyState from './components/ui/EmptyState';
import SectionCard from './components/ui/SectionCard';
import StatCard from './components/ui/StatCard';
import useSSE from './services/useSSE';
// Single shared Luzon coordinate table — this file used to carry its own copy
// that had drifted (it even listed Davao City, outside the Bulacan/Luzon
// service area). Positions here are approximate city-level references only.
import { CITY_COORDS } from './luzonCityCoords';


function MapView({ lat, lng, vehicle, uniqueId }) {
  const containerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

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
        html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;background:#f37021;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;"><div style="transform:rotate(45deg);display:flex;"><img src="${vehicleGlyphSvg(vehicle, 'white')}" alt="" width="16" height="16" style="display:block;" /></div></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });
      markerRef.current = L.marker([lat, lng], { icon: customIcon }).addTo(map);
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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng, vehicle]);

  return <div ref={containerRef} id={`map-${uniqueId}`} style={{ width: '100%', height: '150px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '12px' }} />;
}

export default function MonitorRiderStatus() {
  const [riders, setRiders] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedRider, setSelectedRider] = useState(null);
  const [riderTab, setRiderTab] = useState('details');
  const [riderTimeline, setRiderTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [dutyFilter, setDutyFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');

  const attachLiveGps = useCallback((normalizedRiders) => normalizedRiders.map((r, index) => {
    const coords = CITY_COORDS[r.location.city];
    return {
      ...r,
      liveGps: {
        latitude:  coords ? coords.lat + (index * 0.0015) : null,
        longitude: coords ? coords.lng + (index * 0.0015) : null,
        city: r.location.city || 'Unknown',
        // Duty state comes from the rider's real Android profile toggle
        // (bridge sync-duty-status). Moving/idle is not sent by the app yet,
        // so no such claim is made here.
        isOnline: r.isOnDuty === true || r.raw?.isOnDuty === true,
      },
    };
  }), []);

  const fetchRiders = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      const data = await ridersApi.list();

      if (Array.isArray(data) && data.length > 0) {
        const normalized  = data.map(normalizeRider);
        const activeOnes  = normalized.filter(r => r.status === RIDER_STATUS.ACTIVE);
        const archivedNum = normalized.length - activeOnes.length;

        setRiders(attachLiveGps(activeOnes));
        setArchivedCount(archivedNum);
      } else {
        setRiders([]);
        setArchivedCount(0);
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching riders:', err);
      setRiders([]);
      setArchivedCount(0);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, [attachLiveGps]);

  const filteredRiders = riders.filter((r) => {
    if (searchTerm) {
      const q = searchTerm.trim().toLowerCase();
      const riderId = (r.riderId || '').toLowerCase();
      const name = (r.fullName || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const phone = (r.phone || '').toLowerCase();
      const vehicle = (r.vehicleType || '').toLowerCase();
      const plate = (r.vehiclePlateNumber || '').toLowerCase();
      const hub = (r.assignedHub || r.raw?.assignedHub || r.raw?.assignedHubAddress || r.raw?.address || r.location?.city || '').toLowerCase();
      const matches = riderId.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q) || vehicle.includes(q) || plate.includes(q) || hub.includes(q);
      if (!matches) return false;
    }
    if (dutyFilter === 'online' && !r.liveGps?.isOnline) return false;
    if (dutyFilter === 'offline' && r.liveGps?.isOnline) return false;
    if (vehicleFilter !== 'all' && r.vehicleType !== vehicleFilter) return false;
    return true;
  });

  const isFiltered = searchTerm.trim() !== '' || dutyFilter !== 'all' || vehicleFilter !== 'all';
  const handleResetFilters = () => {
    setSearchTerm('');
    setDutyFilter('all');
    setVehicleFilter('all');
  };

  const formatTimelineDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const fetchRiderTimeline = (rider) => {
    setTimelineLoading(true);
    const events = [];

    // Registration event
    events.push({
      status: 'Registered',
      changedAt: rider.raw?.createdAt || rider.joined,
      reason: `${rider.fullName} joined as a rider`,
    });

    // Status history from DB
    if (rider.raw?.statusHistory && rider.raw.statusHistory.length > 0) {
      rider.raw.statusHistory.forEach(sh => {
        events.push({
          status: sh.status,
          changedAt: sh.changedAt,
          reason: sh.reason || 'Status changed',
        });
      });
    }

    events.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
    setRiderTimeline(events);
    setTimelineLoading(false);
  };

  const { on: onSSE } = useSSE();

  useEffect(() => {
    fetchRiders();
    // Re-fetch every 15 seconds to stay in sync with archive/restore actions
    const interval = setInterval(fetchRiders, 15000);
    return () => clearInterval(interval);
  }, [fetchRiders]);

  useEffect(() => {
    if (!onSSE) return;
    const unsubDuty = onSSE('duty-status-synced', () => fetchRiders());
    const unsubUser = onSSE('user-synced', (ev) => {
      if (!ev || ev.role === 'rider') fetchRiders();
    });
    return () => {
      if (typeof unsubDuty === 'function') unsubDuty();
      if (typeof unsubUser === 'function') unsubUser();
    };
  }, [onSSE, fetchRiders]);

  // (handleToggleGeofence removed — it mutated a `geofences` state that never
  // existed in this component; invoking it would have thrown at runtime.)



  return (
    <div style={{ flex: 1, padding: '24px 30px 48px', minHeight: '100vh', background: '#f0ecf7', fontFamily: "'DM Sans', sans-serif", color: '#390955', overflowY: 'auto' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}`}</style>

      <PageHeader
        title="Monitor Rider Status"
        subtitle="Real-time rider tracking and live duty monitoring"
        breadcrumb={['Dashboard', 'People', 'Riders', 'Duty Monitor']}
        actions={(
          <div className="flex items-center gap-2.5 flex-wrap">
            {lastUpdated && <span style={{ fontSize: 11, color: '#9b82b2', fontFamily: 'monospace' }}>Updated {lastUpdated}</span>}
            <RefreshButton
              onClick={() => fetchRiders(true)}
              isRefreshing={isRefreshing}
            />
            {archivedCount > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(127,140,141,0.1)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#7f8c8d' }}>
                <Archive size={13} aria-hidden="true" /> {archivedCount} Archived (hidden)
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite', display: 'inline-block' }}/>
              {riders.filter(r => r.liveGps?.isOnline).length} Active on Duty
            </span>
          </div>
        )}
      />

      {/* Fleet Stat Cards */}
      <StatCard.Grid cols={3} className="mb-6">
        <StatCard
          label="Riders on Duty"
          value={riders.filter(r => r.liveGps?.isOnline).length}
          sub={`${riders.length > 0 ? Math.round((riders.filter(r => r.liveGps?.isOnline).length / riders.length) * 100) : 0}% active now`}
          tone="emerald"
          trend={riders.filter(r => r.liveGps?.isOnline).length > 0 ? "Active" : "None"}
          trendTone={riders.filter(r => r.liveGps?.isOnline).length > 0 ? "positive" : "neutral"}
        />
        <StatCard
          label="Off Duty / Standby"
          value={riders.length - riders.filter(r => r.liveGps?.isOnline).length}
          sub="Standby or offline couriers"
          tone="purple"
          trend="Standby"
          trendTone="neutral"
        />
        <StatCard
          label="Total Fleet Roster"
          value={riders.length}
          sub={archivedCount > 0 ? `${archivedCount} archived accounts` : "Active registered fleet"}
          tone="orange"
          trend="Total"
          trendTone="neutral"
        />
      </StatCard.Grid>

      {/* Filter & Search Bar */}
      <SectionCard noPadding className="mb-6">
        <FilterBar>
          <FilterBar.Group>
            <FilterBar.Search
              placeholder="Search rider by name, ID, vehicle, or hub..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FilterBar.Select
              aria-label="Filter by duty state"
              value={dutyFilter}
              onChange={(e) => setDutyFilter(e.target.value)}
            >
              <option value="all" className="font-medium text-slate-700 bg-white">All</option>
              <option value="online" className="font-medium text-slate-700 bg-white">On Duty</option>
              <option value="offline" className="font-medium text-slate-700 bg-white">Off Duty</option>
            </FilterBar.Select>
            <FilterBar.Select
              aria-label="Filter by vehicle type"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            >
              <option value="all" className="font-medium text-slate-700 bg-white">All</option>
              <option value="Motorcycle" className="font-medium text-slate-700 bg-white">Motorcycle</option>
              <option value="Van" className="font-medium text-slate-700 bg-white">Van</option>
              <option value="Bicycle" className="font-medium text-slate-700 bg-white">Bicycle</option>
            </FilterBar.Select>
            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw size={11} aria-hidden="true" />
                <span>Reset</span>
              </button>
            )}
            <FilterBar.Count count={filteredRiders.length} label="couriers" />
          </FilterBar.Group>
        </FilterBar>
      </SectionCard>

      {/* Couriers Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-[#e0d5f0] rounded-xl p-5 h-56 shadow-sm" />
          ))}
        </div>
      ) : filteredRiders.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No matching couriers found" : (archivedCount > 0 ? `All ${archivedCount} riders are archived` : "No active riders on duty")}
          description={isFiltered ? "Try adjusting your search or filters." : (archivedCount > 0 ? "Restore riders in Settings to monitor their live GPS." : "Riders will appear here once they register and connect.")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredRiders.map((r) => (
            <SectionCard
              key={r.riderId}
              noPadding
              onClick={() => { setSelectedRider(r); setRiderTab('details'); setRiderTimeline([]); fetchRiderTimeline(r); }}
              className="cursor-pointer hover:border-[#390955] transition-all"
            >
              <div className="p-5 flex flex-col justify-between h-full">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f0eaf8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#390955' }}>
                        <VehicleIcon type={r.vehicleType} size={19} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>{r.fullName}</h4>
                        <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{r.riderId} · {r.vehicleType}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '10px', background: r.liveGps.isOnline ? '#e6f9ed' : '#f5f5f5', color: r.liveGps.isOnline ? '#1e7e34' : '#888', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background: r.liveGps.isOnline ? '#22c55e' : '#bbb', animation: r.liveGps.isOnline ? 'pulse 1.5s infinite' : 'none', display:'inline-block' }}/>
                          {r.liveGps.isOnline ? 'On Duty' : 'Off Duty'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#fcfbfe', border: '1px solid #f0eaf8', borderRadius: '8px', padding: '10px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Rider ID:</span>
                      <span style={{ fontWeight: 600, color: '#390955' }}>{r.riderId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Email Address:</span>
                      <span style={{ fontWeight: 600, fontSize: '11px' }}>{r.email || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Phone Number:</span>
                      <span style={{ fontWeight: 600 }}>{r.phone || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Vehicle Info:</span>
                      <span style={{ fontWeight: 600 }}>{(r.vehicleType || r.vehiclePlateNumber) ? `${r.vehicleType || ''}${r.vehiclePlateNumber ? ` (${r.vehiclePlateNumber})` : ''}`.trim() : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Hub Address:</span>
                      <span style={{ fontWeight: 600, color: '#390955', fontSize: '11px', textAlign: 'right', maxWidth: '60%' }}>{r.assignedHub || r.raw?.assignedHub || r.raw?.assignedHubAddress || r.raw?.address || (r.location?.city ? `${r.location.city} Sorting Hub` : '—')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Approx. Location:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '11px' }}>
                        {r.liveGps.latitude != null && r.liveGps.longitude != null
                          ? `${Number(r.liveGps.latitude).toFixed(4)}, ${Number(r.liveGps.longitude).toFixed(4)} (city-level)`
                          : 'Location unavailable'}
                      </span>
                    </div>
                  </div>
                </div>

                {r.liveGps.latitude != null && r.liveGps.longitude != null && (
                  <MapView lat={r.liveGps.latitude} lng={r.liveGps.longitude} vehicle={r.vehicleType} uniqueId={r.riderId} />
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Rider Detail Modal */}
      {selectedRider && (
        <Modal
          tint="rgba(26,6,40,0.5)"
          blur={false}
          maxWidth={480}
          padding={0}
          onBackdropClick={() => setSelectedRider(null)}
          cardStyle={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}
        >
          {/* Header */}
          <div style={{ background: '#390955', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <VehicleIcon type={selectedRider.vehicleType} size={22} />
              </div>
              <div>
                <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 700 }}>{selectedRider.fullName || 'Rider'}</h3>
                <p style={{ color: 'rgba(255,255,255,0.6)', margin: '2px 0 0', fontSize: 12 }}>{selectedRider.riderId} · {selectedRider.vehicleType}</p>
              </div>
            </div>
            <button onClick={() => setSelectedRider(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>&times;</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '2px solid #f0eaf8' }}>
            {[{ key: 'details', label: 'Details' }, { key: 'timeline', label: 'Timeline' }].map(tab => (
              <button key={tab.key} onClick={() => setRiderTab(tab.key)} style={{
                flex: 1, padding: '12px 0', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                background: riderTab === tab.key ? '#faf7fd' : 'transparent',
                color: riderTab === tab.key ? '#390955' : '#7b6d8d',
                borderBottom: riderTab === tab.key ? '2px solid #390955' : '2px solid transparent',
                marginBottom: -2,
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{ padding: 24, maxHeight: 400, overflowY: 'auto' }}>
            {riderTab === 'details' && (
              <>
                {[
                  { label: 'Full Name', value: selectedRider.fullName },
                  { label: 'Email Address', value: selectedRider.email || '—' },
                  { label: 'Phone Number', value: selectedRider.phone || '—' },
                  { label: 'Vehicle Info', value: `${selectedRider.vehicleType}${selectedRider.vehiclePlateNumber ? ` (${selectedRider.vehiclePlateNumber})` : ''}` },
                  { label: 'Plate Number', value: selectedRider.vehiclePlateNumber || '—' },
                  { label: 'License Number', value: selectedRider.driverLicenseNumber || '—' },
                  { label: 'Hub Address', value: selectedRider.assignedHub || selectedRider.raw?.assignedHub || selectedRider.raw?.assignedHubAddress || selectedRider.raw?.address || (selectedRider.location?.city ? `${selectedRider.location.city} Sorting Hub` : 'Pulilan Sorting Hub') },
                  { label: 'Duty Status', value: selectedRider.liveGps?.isOnline ? 'On Duty' : 'Off Duty', badge: true, color: selectedRider.liveGps?.isOnline ? { bg: '#e6f9ed', color: '#1e7e34' } : { bg: '#f5f5f5', color: '#888888' } },
                  { label: 'Account Status', value: selectedRider.status, badge: true, color: selectedRider.status === 'Active' ? { bg: '#d1fae5', color: '#065f46' } : { bg: '#fee2e2', color: '#991b1b' } },
                  { label: 'Deliveries Completed', value: selectedRider.performance?.deliveriesCount ?? 0 },
                  { label: 'Rating', value: `${selectedRider.performance?.rating ?? 5.0}/5.0` },
                  { label: 'Joined', value: selectedRider.joined || '—' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f0eaf8' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#7b6d8d' }}>{row.label}</span>
                    {row.badge ? (
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: row.color.bg, color: row.color.color }}>{row.value}</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1f1329' }}>{row.value}</span>
                    )}
                  </div>
                ))}
              </>
            )}

            {riderTab === 'timeline' && (
              <>
                {timelineLoading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#a890c0', fontSize: 12 }}>Loading timeline...</div>
                ) : riderTimeline.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4c8e8" strokeWidth="1.5" style={{ marginBottom: 6 }}>
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    <p style={{ color: '#a890c0', fontSize: 12, margin: 0 }}>No status history yet</p>
                  </div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 24 }}>
                    <div style={{ position: 'absolute', left: 9, top: 6, bottom: 6, width: 2, background: '#1E88E5', borderRadius: 1, opacity: 0.3 }} />
                    {riderTimeline.map((evt, idx) => (
                      <div key={idx} style={{ position: 'relative', marginBottom: idx < riderTimeline.length - 1 ? 16 : 0 }}>
                        <div style={{ position: 'absolute', left: -24, top: 2, width: 18, height: 18, borderRadius: '50%', background: '#1E88E5', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, boxShadow: '0 0 0 3px white, 0 0 0 4px rgba(30,136,229,0.2)' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                        </div>
                        <div style={{ padding: '8px 12px', background: '#faf7fd', borderRadius: 8, border: '1px solid #ede6f7' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1f1329' }}>Status: {evt.status}</span>
                            <span style={{ fontSize: 9, color: '#a890c0' }}>{formatTimelineDate(evt.changedAt)}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>{evt.reason || 'No reason provided'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
