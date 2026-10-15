import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getFreshPing, LIVE_REFRESH_MS } from './utils/riderGps';
import { isFinishedParcelStatus, normalizeParcelStatus, IN_FLIGHT_WEIGHT } from './utils/parcelStatus';
import { getParcelPickupCoords, getParcelDeliveryCoords, resolveParcelCurrentLocation } from './utils/parcelLocationResolver';

import { extractMunicipality, matchRider, nearestHub } from './utils/bulacanLocationUtils';
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
import { fetchRoadRoute } from './utils/osrmRouting';

const TILE_LAYERS = {
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles © Esri' },
};

// Rotated courier icon with vehicle glyph, directional nose, and name badge
function buildRiderIcon(L, vehicleType, bearing, selected, riderId = '', steppedAway = false, riderName = '') {
  const size = selected ? 42 : 34;
  const bg = selected ? '#f37021' : '#390955';
  const halo = steppedAway
    ? `<div data-testid="map-rider-away-${riderId}" title="Stepped away from the doorstep" style="position:absolute;inset:-7px;border-radius:50%;border:2px dashed #f59e0b;background:rgba(245,158,11,0.18);"></div>`
    : '';
  const badge = steppedAway
    ? `<div style="position:absolute;top:-6px;right:-6px;width:15px;height:15px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:900;line-height:1;transform:rotate(${-bearing}deg);">!</div>`
    : '';
  const nameLabel = riderName
    ? `<div style="position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%) rotate(${-bearing}deg);background:#390955;color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:1.5px solid white;pointer-events:none;z-index:10;">${riderName}</div>`
    : '';
  const html = `
    <div data-testid="map-rider-${riderId}" style="position:relative;width:${size}px;height:${size}px;transform:rotate(${bearing}deg);">
      ${halo}
      <div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${bg};"></div>
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;transform:rotate(${-bearing}deg);">
        <img src="${vehicleGlyphSvg(vehicleType, 'white')}" alt="" width="${selected ? 19 : 15}" height="${selected ? 19 : 15}" style="display:block;" />
      </div>
      ${badge}
      ${nameLabel}
    </div>
  `;
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 6] });
}

function buildRiderPopupHtml(rider) {
  const hub = LOGISTICS_HUBS.find(h => h.hubId === rider.destinationHubId);
  const gpsLine = rider.isLivePing
    ? '<span style="color:#16a34a;font-weight:700;">● Live GPS Ping</span><br/>'
    : rider.hasRealGps
    ? '<span style="color:#0284c7;font-weight:700;">● Telemetry / Location Fix</span><br/>'
    : '<span style="color:#b45309;font-weight:700;">● Hub Station / Standby</span><br/>';
  const doorstepLine = rider.steppedAway
    ? '<span style="color:#b45309;font-weight:700;">● Stepped away from the doorstep</span><br/>'
    : '';
  const returnedLine = rider.stepReturned
    ? '<span style="color:#7c3aed;font-weight:700;">● Returning parcel to hub</span><br/>'
    : '';
  const dutyBadge = rider.isOnDuty
    ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;background:#ecfdf5;color:#047857;font-weight:700;font-size:10px;">On Duty</span>'
    : '<span style="display:inline-block;padding:1px 6px;border-radius:6px;background:#f1f5f9;color:#64748b;font-weight:700;font-size:10px;">Off Duty</span>';
  const routeDistLine = (rider.routeDistanceMeters && rider.routeDistanceMeters > 0)
    ? `<span style="color:#f37021;font-weight:600;">Road route: ${(rider.routeDistanceMeters / 1000).toFixed(1)} km</span><br/>`
    : '';
  return `
    <div style="font-family:sans-serif;font-size:12px;line-height:1.8;min-width:190px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
        <b style="color:#390955;font-size:13px;">${rider.fullName}</b>
        ${dutyBadge}
      </div>
      <span style="color:#9b82b2;font-size:11px;font-family:monospace;">${rider.riderId}</span><br/>
      <span style="color:#555;">${vehicleTypeLabel(rider.vehicleType)} · ${rider.vehiclePlate || rider.vehicleType}</span><br/>
      ${gpsLine}
      ${doorstepLine}
      ${returnedLine}
      ${routeDistLine}
      <span style="color:#888;">${rider.city || 'Bulacan'} · ${rider.province || 'Central Luzon'}</span><br/>
      <span style="color:#f37021;font-weight:600;">Base: ${hub ? hub.hubName : 'Pulilan Central Hub'}</span>
    </div>
  `;
}

function getParcelStatusColor(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'delivered' || st === 'completed') return '#16a34a';
  if (st === 'cancelled' || st === 'canceled') return '#ef4444';
  if (st === 'failed' || st.includes('failed') || st === 'attempted') return '#f59e0b';
  if (st === 'out for delivery') return '#f37021';
  if (st.includes('return')) return '#ea580c';
  if (st === 'in transit' || st === 'shipping' || st === 'picked up') return '#2563eb';
  if (st === 'confirmed' || st === 'processing' || st === 'to ship') return '#f37021';
  return '#6b7280';
}

function getStatusBadgeStyle(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'delivered' || st === 'completed') return 'background:#ecfdf5;color:#15803d;border:1px solid #bbf7d0;';
  if (st === 'out for delivery') return 'background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;';
  if (st === 'cancelled' || st === 'canceled') return 'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;';
  if (st === 'failed' || st.includes('failed') || st === 'attempted') return 'background:#fffbeb;color:#b45309;border:1px solid #fde68a;';
  if (st.includes('return')) return 'background:#fff7ed;color:#ea580c;border:1px solid #ffedd5;';
  if (st === 'in transit' || st === 'shipping' || st === 'picked up') return 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;';
  if (st === 'confirmed' || st === 'processing' || st === 'to ship') return 'background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;';
  return 'background:#f3f4f6;color:#4b5563;border:1px solid #e5e7eb;';
}

// Pickup Point Pin
function buildPickupIcon(L, item, selected, trackingNumber = '', stopNumber = null, status = '') {
  const size = selected ? 36 : 28;
  const st = String(status || '').toLowerCase();
  let bg = selected ? '#047857' : '#059669';
  let badgeBg = '#047857';
  let labelBg = '#059669';
  if (st === 'cancelled' || st === 'canceled') {
    bg = selected ? '#b91c1c' : '#ef4444';
    badgeBg = '#b91c1c';
    labelBg = '#ef4444';
  } else if (st === 'failed' || st.includes('failed') || st === 'attempted') {
    bg = selected ? '#d97706' : '#f59e0b';
    badgeBg = '#d97706';
    labelBg = '#f59e0b';
  } else if (st.includes('return')) {
    bg = selected ? '#c2410c' : '#ea580c';
    badgeBg = '#c2410c';
    labelBg = '#ea580c';
  } else if (['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(st)) {
    bg = selected ? '#c2410c' : '#f37021';
    badgeBg = '#c2410c';
    labelBg = '#f37021';
  }
  const badge = stopNumber ? `
    <div style="position:absolute;top:-6px;left:-6px;width:17px;height:17px;border-radius:50%;background:${badgeBg};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:900;z-index:10;">${stopNumber}</div>
  ` : '';
  const label = item ? `
    <div style="position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%);background:${labelBg};color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:1.5px solid white;pointer-events:none;z-index:9;">
      ${stopNumber ? `Stop ${stopNumber} · ` : ''}Pickup: ${item}
    </div>
  ` : '';
  const html = `
    <div data-testid="map-pickup-${trackingNumber}" style="position:relative;width:${size}px;height:${size}px;">
      ${badge}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
        <svg width="${selected ? 18 : 14}" height="${selected ? 18 : 14}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      </div>
      ${label}
    </div>
  `;
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 6] });
}

function buildPickupPopupHtml(parcel) {
  const badgeStyle = getStatusBadgeStyle(parcel.status);
  return `
    <div style="font-family:sans-serif;font-size:12px;line-height:1.7;min-width:190px;">
      <b style="color:#059669;font-size:13px;">Pickup Origin Point</b><br/>
      <span style="color:#f37021;font-size:11px;font-family:monospace;font-weight:700;">${parcel.trackingNumber}</span><br/>
      <span style="color:#1a0a2e;font-weight:600;">${parcel.item || 'Package'} (${parcel.weight || '—'} kg)</span><br/>
      <span style="color:#666;">Sender: ${parcel.senderName || 'Merchant'}</span><br/>
      <span style="color:#888;font-size:11px;">${parcel.origin || '—'}</span><br/>
      <span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:6px;${badgeStyle};font-weight:700;font-size:10px;">${parcel.status}</span>
    </div>
  `;
}

// Delivery Point Pin
function buildDeliveryIcon(L, receiver, selected, trackingNumber = '', stopNumber = null, status = '') {
  const size = selected ? 36 : 28;
  const st = String(status || '').toLowerCase();
  let bg = selected ? '#1d4ed8' : '#2563eb';
  let badgeBg = selected ? '#1d4ed8' : '#2563eb';
  let labelBg = '#2563eb';
  if (st === 'delivered' || st === 'completed') {
    bg = selected ? '#15803d' : '#16a34a';
    badgeBg = '#15803d';
    labelBg = '#16a34a';
  } else if (st === 'cancelled' || st === 'canceled') {
    bg = selected ? '#b91c1c' : '#ef4444';
    badgeBg = '#b91c1c';
    labelBg = '#ef4444';
  } else if (st === 'failed' || st.includes('failed') || st === 'attempted') {
    bg = selected ? '#d97706' : '#f59e0b';
    badgeBg = '#d97706';
    labelBg = '#f59e0b';
  } else if (st === 'out for delivery') {
    bg = selected ? '#ea580c' : '#f37021';
    badgeBg = '#ea580c';
    labelBg = '#f37021';
  } else if (st.includes('return')) {
    bg = selected ? '#c2410c' : '#ea580c';
    badgeBg = '#c2410c';
    labelBg = '#ea580c';
  } else if (['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(st)) {
    bg = selected ? '#4b5563' : '#6b7280';
    badgeBg = '#4b5563';
    labelBg = '#6b7280';
  }

  const badge = stopNumber ? `
    <div style="position:absolute;top:-6px;left:-6px;width:17px;height:17px;border-radius:50%;background:${badgeBg};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:900;z-index:10;">${stopNumber}</div>
  ` : '';
  const label = receiver ? `
    <div style="position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%);background:${labelBg};color:#ffffff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:1.5px solid white;pointer-events:none;z-index:9;">
      ${stopNumber ? `Stop ${stopNumber} · ` : ''}Delivery: ${receiver}
    </div>
  ` : '';
  const html = `
    <div data-testid="map-delivery-${trackingNumber}" style="position:relative;width:${size}px;height:${size}px;">
      ${badge}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
        <svg width="${selected ? 18 : 14}" height="${selected ? 18 : 14}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
      ${label}
    </div>
  `;
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 - 6] });
}

function buildDeliveryPopupHtml(parcel) {
  const badgeStyle = getStatusBadgeStyle(parcel.status);
  return `
    <div style="font-family:sans-serif;font-size:12px;line-height:1.7;min-width:190px;">
      <b style="color:#2563eb;font-size:13px;">Delivery Destination Point</b><br/>
      <span style="color:#f37021;font-size:11px;font-family:monospace;font-weight:700;">${parcel.trackingNumber}</span><br/>
      <span style="color:#1a0a2e;font-weight:600;">Recipient: ${parcel.receiverName || 'Customer'}</span><br/>
      <span style="color:#666;">Phone: ${parcel.receiverPhone || '—'}</span><br/>
      <span style="color:#888;font-size:11px;">${parcel.destination || '—'}</span><br/>
      <span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:6px;${badgeStyle};font-weight:700;font-size:10px;">${parcel.status}</span>
    </div>
  `;
}

function PickupPointMarker({ L, map, parcel, isSelected, stopNumber, onSelect }) {
  const markerRef = useRef(null);
  useEffect(() => {
    if (!L || !map || !parcel.pickupLat || !parcel.pickupLng) return undefined;
    const marker = L.marker([parcel.pickupLat, parcel.pickupLng], {
      icon: buildPickupIcon(L, parcel.item, isSelected, parcel.trackingNumber, stopNumber, parcel.status),
      zIndexOffset: isSelected ? 800 : 500,
    })
      .bindPopup(buildPickupPopupHtml(parcel))
      .on('mouseover', function () { this.openPopup(); })
      .on('mouseout', function () { this.closePopup(); })
      .on('click', () => onSelect && onSelect(parcel.trackingNumber))
      .addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [L, map, parcel.trackingNumber, parcel.pickupLat, parcel.pickupLng, parcel.item, parcel.status, isSelected, stopNumber, onSelect]);

  return null;
}

function DeliveryPointMarker({ L, map, parcel, isSelected, stopNumber, onSelect }) {
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  useEffect(() => {
    if (!L || !map || !parcel.destLat || !parcel.destLng) return undefined;
    const st = String(parcel.status || '').toLowerCase();
    let fenceColor = '#2563eb';
    if (st === 'out for delivery') fenceColor = '#f37021';
    else if (st === 'delivered' || st === 'completed') fenceColor = '#16a34a';
    else if (st === 'cancelled' || st === 'canceled') fenceColor = '#ef4444';
    else if (st === 'failed' || st.includes('failed') || st === 'attempted') fenceColor = '#f59e0b';
    else if (st.includes('return')) fenceColor = '#ea580c';
    else if (['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(st)) fenceColor = '#9ca3af';

    // 100m Doorstep Geofence ring (matching mobile doorstep delivery zone)
    const geofenceRadius = (parcel.trackingGeofence && parcel.trackingGeofence.radiusMeters) || 100;
    const circle = L.circle([parcel.destLat, parcel.destLng], {
      radius: geofenceRadius,
      color: fenceColor,
      fillColor: fenceColor,
      fillOpacity: isSelected ? 0.20 : 0.12,
      weight: isSelected ? 2.5 : 1.8,
      dashArray: '5,5',
    }).addTo(map);
    circleRef.current = circle;

    const marker = L.marker([parcel.destLat, parcel.destLng], {
      icon: buildDeliveryIcon(L, parcel.receiverName, isSelected, parcel.trackingNumber, stopNumber, parcel.status),
      zIndexOffset: isSelected ? 800 : 500,
    })
      .bindPopup(buildDeliveryPopupHtml(parcel))
      .on('mouseover', function () { this.openPopup(); })
      .on('mouseout', function () { this.closePopup(); })
      .on('click', () => onSelect && onSelect(parcel.trackingNumber))
      .addTo(map);
    markerRef.current = marker;

    return () => {
      circle.remove();
      circleRef.current = null;
      marker.remove();
      markerRef.current = null;
    };
  }, [L, map, parcel.trackingNumber, parcel.destLat, parcel.destLng, parcel.receiverName, parcel.status, parcel.trackingGeofence, isSelected, stopNumber, onSelect]);

  return null;
}


// Returns the cached route for a rider when its points haven't changed
function stableRoute(cache, riderId, route) {
  const prev = cache[riderId];
  if (!prev) {
    cache[riderId] = route;
    return route;
  }
  if (Array.isArray(prev) && Array.isArray(route) && prev.length === route.length) {
    const pStart = prev[0], pEnd = prev[prev.length - 1];
    const rStart = route[0], rEnd = route[route.length - 1];
    if (
      pStart && rStart && pEnd && rEnd &&
      pStart.lat === rStart.lat && pStart.lng === rStart.lng &&
      pEnd.lat === rEnd.lat && pEnd.lng === rEnd.lng
    ) {
      return prev;
    }
  }
  cache[riderId] = route;
  return route;
}

function AnimatedRiderMarker({ L, map, rider, isSelected, onSelect }) {
  const markerRef = useRef(null);
  const routeLineRef = useRef(null);

  useEffect(() => {
    if (!L || !map || !rider.route || rider.route.length < 2) return undefined;

    const line = L.polyline(rider.route.map(p => [p.lat, p.lng]), {
      color: '#f37021', weight: isSelected ? 4.5 : 2.5, opacity: isSelected ? 0.95 : 0.45, dashArray: isSelected ? null : '7,6',
    }).addTo(map);
    routeLineRef.current = line;

    const marker = L.marker([rider.lat, rider.lng], {
      icon: buildRiderIcon(L, rider.vehicleType, 0, isSelected, rider.riderId, rider.steppedAway, rider.fullName),
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
  }, [L, map, rider.riderId, rider.route, rider.steppedAway, rider.fullName, isSelected, onSelect]);

  const handleFrame = useCallback((state) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([state.lat, state.lng]);
      markerRef.current.setIcon(buildRiderIcon(L, rider.vehicleType, state.bearing, isSelected, rider.riderId, rider.steppedAway, rider.fullName));
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

  const animSpeed = (rider.speedKmh && rider.speedKmh > 0) ? rider.speedKmh : 35;
  useRouteAnimation(rider.route, {
    speedKmh: animSpeed,
    simSpeedMultiplier: 18,
    startProgress: rider.taskProgress || 0,
    loop: false,
  }, handleFrame);

  return null;
}

// How long a live marker takes to glide from its old position to a new ping (matches 3s refresh)
const LIVE_GLIDE_MS = 3000;

function LiveGpsMarker({ L, map, rider, isSelected, onSelect }) {
  const markerRef = useRef(null);
  const routeLineRef = useRef(null);
  const bearingRef = useRef(rider.heading ?? 0);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });

  // Initialize marker once on mount (only recreates if riderId or map changes)
  useEffect(() => {
    if (!L || !map) return undefined;

    if (rider.route && rider.route.length >= 2) {
      const line = L.polyline(rider.route.map(p => [p.lat, p.lng]), {
        color: '#f37021', weight: isSelected ? 4.5 : 2.5, opacity: isSelected ? 0.95 : 0.5, dashArray: isSelected ? null : '7,6',
      }).addTo(map);
      routeLineRef.current = line;
    }

    const targetPos = { lat: rider.lat, lng: rider.lng };

    const marker = L.marker([targetPos.lat, targetPos.lng], {
      icon: buildRiderIcon(L, rider.vehicleType, bearingRef.current, isSelected, rider.riderId, rider.steppedAway, rider.fullName),
      zIndexOffset: 1000,
    })
      .bindPopup(buildRiderPopupHtml(rider))
      .on('mouseover', function () { this.openPopup(); })
      .on('mouseout', function () { this.closePopup(); })
      .on('click', () => onSelectRef.current(rider.riderId))
      .addTo(map);
    markerRef.current = marker;

    return () => {
      if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
      marker.remove();
      markerRef.current = null;
    };
  }, [L, map, rider.riderId]);

  // Update route polyline geometry in-place when rider.route updates
  useEffect(() => {
    if (!L || !map) return;
    if (rider.route && rider.route.length >= 2) {
      const latlngs = rider.route.map(p => [p.lat, p.lng]);
      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(latlngs);
        routeLineRef.current.setStyle({
          color: '#f37021',
          weight: isSelected ? 4.5 : 2.5,
          opacity: isSelected ? 0.95 : 0.5,
          dashArray: isSelected ? null : '7,6',
        });
      } else {
        routeLineRef.current = L.polyline(latlngs, {
          color: '#f37021', weight: isSelected ? 4.5 : 2.5, opacity: isSelected ? 0.95 : 0.5, dashArray: isSelected ? null : '7,6',
        }).addTo(map);
      }
    } else if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
  }, [L, map, rider.route, isSelected]);

  // Smooth continuous glide to new coordinates without destroying marker
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !Number.isFinite(rider.lat) || !Number.isFinite(rider.lng)) return undefined;

    const targetPos = { lat: rider.lat, lng: rider.lng };
    const from = marker.getLatLng();

    // Dynamically calculate bearing/heading in direction of movement
    const dLat = targetPos.lat - from.lat;
    const dLng = targetPos.lng - from.lng;
    if (Math.abs(dLat) > 0.00002 || Math.abs(dLng) > 0.00002) {
      const rad = Math.atan2(dLng, dLat);
      const deg = (rad * 180 / Math.PI + 360) % 360;
      bearingRef.current = deg;
    } else if (rider.heading != null) {
      bearingRef.current = rider.heading;
    }

    marker.setIcon(buildRiderIcon(L, rider.vehicleType, bearingRef.current, isSelected, rider.riderId, rider.steppedAway, rider.fullName));
    marker.setPopupContent(buildRiderPopupHtml(rider));

    const distDelta = Math.hypot(dLat, dLng);
    if (distDelta < 0.00001) {
      return undefined;
    }
    if (distDelta > 0.5) {
      marker.setLatLng([targetPos.lat, targetPos.lng]);
      return undefined;
    }

    // Smooth continuous glide along the road corridor
    const startTime = performance.now();
    let rafId = null;
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / LIVE_GLIDE_MS);
      // Smooth sinusoidal ease-in-out for natural vehicle acceleration
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      marker.setLatLng([
        from.lat + (targetPos.lat - from.lat) * ease,
        from.lng + (targetPos.lng - from.lng) * ease,
      ]);
      if (t < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [L, rider.lat, rider.lng, rider.heading, rider.steppedAway, rider.fullName, rider.vehicleType, isSelected]);

  return null;
}

export default function LiveRiderMap({
  externalSelectedRiderId,
  externalSelectedTrackingId,
  onSelectRider,
  refreshTrigger,
  activeRidersCount,
  activeShipmentsCount,
}) {
  const [riders, setRiders]           = useState([]);
  const [parcels, setParcels]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [, setLastUpdated] = useState('');
  const [selectedHub, setSelectedHub]     = useState(null);
  const [selectedRider, setSelectedRider] = useState(null);
  const [sidePanelTab, setSidePanelTab]   = useState('hubs'); // 'hubs' | 'parcels'
  const [riderFilter, setRiderFilter]     = useState('all');
  // Admin-exclusive filters (shipment status / location scope)
  const [statusFilter, setStatusFilter]   = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  // Zone -> Municipality -> Barangay cascade (deliveryZoneDirectory.js;
  // barangay data covers 3/24 towns until professor sign-off).
  const [zoneFilter, setZoneFilter] = useState('all');
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [focusedStopTracking, setFocusedStopTracking] = useState(null);
  const [mapReady, setMapReady]       = useState(false);
  const [layers, setLayers] = useState({ satellite: false, geofences: true, heatmap: false });

  const divRef       = useRef(null);
  const mapRef       = useRef(null);
  const LRef         = useRef(null);
  const hubCircleRefs = useRef({});
  const hubMarkerRefs = useRef({});
  const tileLayerRef  = useRef(null);
  const heatLayerRef  = useRef(null);
  const routeCacheRef = useRef({});
  // D-13 doorstep state, keyed by tracking number: 'departed' | 'returned'.
  // Held in a ref rather than state because the rider mapper reads it while
  // rebuilding the list on a refresh — a ref is always current there, and the
  // SSE handler below triggers that very refresh.
  const stepStateRef = useRef({});
  const fetchTimeoutRef = useRef(null);
  const inFlightRef = useRef(false);

  const handleSelectRider = (id) => {
    setSelectedHub(null);
    setSelectedRider(id);
    setFocusedStopTracking(null);
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

  useEffect(() => {
    if (externalSelectedTrackingId !== undefined) {
      setFocusedStopTracking(externalSelectedTrackingId);
    }
  }, [externalSelectedTrackingId]);

  const prevSelectedRiderRef = useRef(selectedRider);
  // Camera rule: ONLY a selection-id transition moves the camera. Live data
  // refreshes (riders/parcels/focusedStop) must never steal the user's zoom.
  useEffect(() => {
    if (!mapRef.current || !LRef.current) return;
    if (prevSelectedRiderRef.current === selectedRider) return;
    prevSelectedRiderRef.current = selectedRider;
    if (selectedRider) {
      const target = riders.find(r => r.riderId === selectedRider);
      if (target && target.lat && target.lng) {
        const points = [[target.lat, target.lng]];
        const held = parcels.filter(p => matchRider(p.riderId || p.rider, target));
        const activeHeld = focusedStopTracking
          ? held.filter(p => (p.trackingNumber || p.trackingId) === focusedStopTracking)
          : held;
        activeHeld.forEach(p => {
          if (p.pickupLat && p.pickupLng) points.push([p.pickupLat, p.pickupLng]);
          if (p.destLat && p.destLng) points.push([p.destLat, p.destLng]);
        });
        if (points.length > 1) {
          mapRef.current.fitBounds(LRef.current.latLngBounds(points), { padding: [80, 80], maxZoom: 15, animate: true });
        } else {
          mapRef.current.setView([target.lat, target.lng], Math.max(mapRef.current.getZoom(), 14), { animate: true });
        }
      }
    } else if (LRef.current) {
      // Deselect: keep the user's zoom/center untouched. The hub-wide refit
      // previously snapped a zoomed-in view back out to the region.
      prevSelectedRiderRef.current = selectedRider;
    }
  }, [selectedRider]);

  const toggleLayer = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [rData, pData, locData] = await Promise.all([
        ridersApi.list(),
        parcelsApi.list(),
        parcelLocationsApi.list().catch(() => []),
      ]);

      const safeRiders = Array.isArray(rData) ? rData : [];
      const safeParcels = Array.isArray(pData) ? pData : [];
      const safeLocations = Array.isArray(locData) ? locData : [];

      // parcelId -> { lat, lng } from the newest telemetry
      const telemetryByParcel = {};
      safeLocations.forEach(loc => {
        const lat = parseFloat(loc.lat);
        const lng = parseFloat(loc.lng);
        if (loc.parcelId && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
          telemetryByParcel[String(loc.parcelId).toUpperCase()] = { lat, lng, updatedAt: loc.updatedAt };
        }
      });

      const rawRiders = safeRiders
        .filter(r => {
          const st = String(r.status || 'active').toLowerCase();
          return st === 'active' || st === 'on_duty' || st === 'in_transit';
        })
        .map((r, i) => {
          const coords = CITY_COORDS[r.city];
          const riderAssignedParcels = safeParcels.filter(p => matchRider(p.riderId || p.rider, r) && !isFinishedParcelStatus(p.status));
          riderAssignedParcels.sort((a, b) => {
            const weightA = IN_FLIGHT_WEIGHT[String(a.status || '').toLowerCase()] ?? 0;
            const weightB = IN_FLIGHT_WEIGHT[String(b.status || '').toLowerCase()] ?? 0;
            if (weightB !== weightA) return weightB - weightA;

            const fixA = telemetryByParcel[(a.trackingNumber || a.trackingId || '').toUpperCase()];
            const fixB = telemetryByParcel[(b.trackingNumber || b.trackingId || '').toUpperCase()];
            if (fixA && !fixB) return -1;
            if (!fixA && fixB) return 1;
            if (fixA && fixB) {
              const timeA = new Date(fixA.updatedAt || 0).getTime();
              const timeB = new Date(fixB.updatedAt || 0).getTime();
              if (timeA !== timeB) return timeB - timeA;
            }
            return 0;
          });
          const focusedParcel = focusedStopTracking
            ? riderAssignedParcels.find(p => (p.trackingNumber || p.trackingId) === focusedStopTracking)
            : null;
          const heldParcel = focusedParcel || riderAssignedParcels[0] || null;

          const ping = getFreshPing(r);
          const parcelFix = heldParcel ? telemetryByParcel[(heldParcel.trackingNumber || heldParcel.trackingId || '').toUpperCase()] : null;

          const pulilanCoords = LOGISTICS_HUBS[0].coordinates; // Pulilan Central Hub { lat: 14.9015, lng: 120.8650 }
          const heldRiderLat = Number(heldParcel?.riderLat ?? heldParcel?.telemetry?.riderLat);
          const heldRiderLng = Number(heldParcel?.riderLng ?? heldParcel?.telemetry?.riderLng);
          const hasHeldParcelFix = Number.isFinite(heldRiderLat) && Number.isFinite(heldRiderLng)
            && !(heldRiderLat === 0 && heldRiderLng === 0);

          const lastLoc = r.lastLocation;
          const hasLastLocationFix = lastLoc
            && Number.isFinite(Number(lastLoc.lat)) && Number.isFinite(Number(lastLoc.lng))
            && !(Number(lastLoc.lat) === 0 && Number(lastLoc.lng) === 0);

          let lat = null;
          let lng = null;
          let hasRealGps = false;
          let isLivePing = false;

          // 1. Shipment-level telemetry from mobile app is the single source of truth for active task
          if (hasHeldParcelFix) {
            lat = heldRiderLat;
            lng = heldRiderLng;
            hasRealGps = true;
            isLivePing = true;
          } else if (ping) {
            lat = ping.lat;
            lng = ping.lng;
            hasRealGps = true;
            isLivePing = true;
          } else if (hasLastLocationFix) {
            lat = Number(lastLoc.lat);
            lng = Number(lastLoc.lng);
            hasRealGps = true;
            isLivePing = true;
          } else if (heldParcel) {
            // 2. Dynamic corridor placement matching mobile app progressFraction
            const frac = Number(heldParcel.telemetry?.progressFraction);
            const validFrac = Number.isFinite(frac) && frac >= 0 ? Math.min(1.0, frac) : null;
            const heldSt = String(heldParcel.status || '').toLowerCase();
            const isHeldReturning = heldSt === 'returning' || heldSt === 'returns' || heldSt === 'failed';
            const isHeldPickupLeg = ['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(heldSt);
            const pHeldPickup = getParcelPickupCoords(heldParcel) || (coords ? { lat: coords.lat, lng: coords.lng } : null);
            const pHeldDest = getParcelDeliveryCoords(heldParcel);

            if (isHeldReturning) {
              const pStart = pHeldDest || pulilanCoords;
              const f = validFrac !== null ? validFrac : 0.5;
              lat = pStart.lat + (pulilanCoords.lat - pStart.lat) * f;
              lng = pStart.lng + (pulilanCoords.lng - pStart.lng) * f;
            } else if (isHeldPickupLeg) {
              const pEnd = pHeldPickup || pulilanCoords;
              const f = validFrac !== null ? validFrac : 0.0;
              lat = pulilanCoords.lat + (pEnd.lat - pulilanCoords.lat) * f;
              lng = pulilanCoords.lng + (pEnd.lng - pulilanCoords.lng) * f;
            } else {
              // Delivery corridor: Pickup -> Pulilan Hub -> Delivery Address
              const f = validFrac !== null ? validFrac : (heldSt === 'out for delivery' ? 0.75 : heldSt === 'in transit' ? 0.45 : 0.15);
              const pStart = pHeldPickup || pulilanCoords;
              const pEnd = pHeldDest || pulilanCoords;
              if (f <= 0.5) {
                const subF = f * 2.0;
                lat = pStart.lat + (pulilanCoords.lat - pStart.lat) * subF;
                lng = pStart.lng + (pulilanCoords.lng - pStart.lng) * subF;
              } else {
                const subF = (f - 0.5) * 2.0;
                lat = pulilanCoords.lat + (pEnd.lat - pulilanCoords.lat) * subF;
                lng = pulilanCoords.lng + (pEnd.lng - pulilanCoords.lng) * subF;
              }
            }
            hasRealGps = true;
            isLivePing = true;
          } else {
            lat = pulilanCoords.lat;
            lng = pulilanCoords.lng;
            hasRealGps = true;
            isLivePing = false;
          }

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            if (coords) {
              lat = coords.lat + (i * 0.003);
              lng = coords.lng + (i * 0.002);
            } else {
              const defaultHub = LOGISTICS_HUBS.find(h => r.assignedHub && h.hubName.includes(r.assignedHub)) || LOGISTICS_HUBS[0];
              lat = defaultHub.coordinates.lat + ((i + 1) * 0.003);
              lng = defaultHub.coordinates.lng + ((i + 1) * 0.003);
            }
          }

          const hub = nearestHub(lat, lng);
          const riderId = r.registrationId || r._id;

          // Build ordered stops for this courier across all assigned parcels (or isolated to focused parcel)
          const assignedStops = [];
          const parcelsForStops = (focusedStopTracking && riderAssignedParcels.some(p => (p.trackingNumber || p.trackingId) === focusedStopTracking))
            ? riderAssignedParcels.filter(p => (p.trackingNumber || p.trackingId) === focusedStopTracking)
            : riderAssignedParcels;

          // Strictly sequence: Active in-flight doorstep deliveries FIRST, then returning legs, then pending collections NEXT!
          const inFlightList = [];
          const returnList = [];
          const pickupList = [];
          parcelsForStops.forEach(p => {
            const st = String(p.status || '').toLowerCase();
            const isReturning = st === 'returning' || st === 'returns' || st === 'failed' || st.includes('failed') || st === 'attempted' || st.includes('return');
            const isPickupLeg = ['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(st);
            if (isReturning) {
              returnList.push(p);
            } else if (isPickupLeg) {
              pickupList.push(p);
            } else {
              inFlightList.push(p);
            }
          });
          const orderedParcelsForStops = [...inFlightList, ...returnList, ...pickupList];

          const seenStopKeys = new Set();
          orderedParcelsForStops.forEach(p => {
            const st = String(p.status || '').toLowerCase();
            const isReturning = st === 'returning' || st === 'returns';
            const isPickupLeg = ['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(st);
            const pPickup = getParcelPickupCoords(p);
            const pDest = getParcelDeliveryCoords(p);
            const trk = p.trackingNumber || p.trackingId;

            if (isReturning) {
              const targetCoords = pPickup || pDest;
              if (targetCoords && Number.isFinite(targetCoords.lat) && Number.isFinite(targetCoords.lng)) {
                const key = `${trk}_return_${targetCoords.lat.toFixed(5)}_${targetCoords.lng.toFixed(5)}`;
                if (!seenStopKeys.has(key)) {
                  seenStopKeys.add(key);
                  assignedStops.push({
                    trackingNumber: trk,
                    parcel: p,
                    type: 'return',
                    status: p.status,
                    item: p.item || p.packageCategory || 'Package (Return)',
                    contactName: p.senderName || 'Merchant (Return)',
                    address: p.origin || 'Seller Location',
                    lat: targetCoords.lat,
                    lng: targetCoords.lng,
                    stopIndex: assignedStops.length + 1,
                  });
                }
              }
            } else if (isPickupLeg) {
              if (pPickup && Number.isFinite(pPickup.lat) && Number.isFinite(pPickup.lng)) {
                const key = `${trk}_pickup_${pPickup.lat.toFixed(5)}_${pPickup.lng.toFixed(5)}`;
                if (!seenStopKeys.has(key)) {
                  seenStopKeys.add(key);
                  assignedStops.push({
                    trackingNumber: trk,
                    parcel: p,
                    type: 'pickup',
                    status: p.status,
                    item: p.item || p.packageCategory || 'Package',
                    contactName: p.senderName || 'Merchant',
                    address: p.origin || 'Seller Location',
                    lat: pPickup.lat,
                    lng: pPickup.lng,
                    stopIndex: assignedStops.length + 1,
                  });
                }
              }
              // Also connect to destination doorstep so the corridor doesn't stop halfway!
              if (pDest && Number.isFinite(pDest.lat) && Number.isFinite(pDest.lng)) {
                const key = `${trk}_delivery_${pDest.lat.toFixed(5)}_${pDest.lng.toFixed(5)}`;
                if (!seenStopKeys.has(key)) {
                  seenStopKeys.add(key);
                  assignedStops.push({
                    trackingNumber: trk,
                    parcel: p,
                    type: 'delivery',
                    status: p.status,
                    item: p.item || p.packageCategory || 'Package',
                    contactName: p.receiverName || 'Recipient',
                    address: p.destination || 'Delivery Point',
                    lat: pDest.lat,
                    lng: pDest.lng,
                    stopIndex: assignedStops.length + 1,
                  });
                }
              }
            } else {
              // In transit / Out for delivery -> task route connects pickup origin to delivery destination
              if (pPickup && Number.isFinite(pPickup.lat) && Number.isFinite(pPickup.lng)) {
                const pickupKey = `${trk}_origin_${pPickup.lat.toFixed(5)}_${pPickup.lng.toFixed(5)}`;
                if (!seenStopKeys.has(pickupKey)) {
                  seenStopKeys.add(pickupKey);
                  assignedStops.push({
                    trackingNumber: trk,
                    parcel: p,
                    type: 'origin',
                    status: p.status,
                    item: p.item || p.packageCategory || 'Package',
                    contactName: p.senderName || 'Merchant',
                    address: p.origin || 'Store Location',
                    lat: pPickup.lat,
                    lng: pPickup.lng,
                    stopIndex: assignedStops.length + 1,
                  });
                }
              }
              if (pDest && Number.isFinite(pDest.lat) && Number.isFinite(pDest.lng)) {
                const key = `${trk}_delivery_${pDest.lat.toFixed(5)}_${pDest.lng.toFixed(5)}`;
                if (!seenStopKeys.has(key)) {
                  seenStopKeys.add(key);
                  assignedStops.push({
                    trackingNumber: trk,
                    parcel: p,
                    type: 'delivery',
                    status: p.status,
                    item: p.item || p.packageCategory || 'Package',
                    contactName: p.receiverName || 'Recipient',
                    address: p.destination || 'Delivery Point',
                    lat: pDest.lat,
                    lng: pDest.lng,
                    stopIndex: assignedStops.length + 1,
                  });
                }
              }
            }
          });

          // Multi-stop connected route based on delivery tasks
          const isReturningToHub = assignedStops.length === 0 || assignedStops.every(s => s.type === 'return');
          let riderRoute = [];

          const heldSt = String(heldParcel?.status || '').toLowerCase();
          const isHeldReturning = heldSt === 'returning' || heldSt === 'returns' || heldSt === 'failed' || heldSt.includes('failed') || heldSt === 'attempted' || heldSt.includes('return');
          const isHeldPickupLeg = ['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(heldSt);
          const isHeldDelivery = ['picked up', 'in transit', 'shipping', 'out for delivery', 'received at hub'].includes(heldSt);
          const pHeldPickup = heldParcel ? getParcelPickupCoords(heldParcel) : null;
          const pHeldDest = heldParcel ? getParcelDeliveryCoords(heldParcel) : null;

          if (isHeldReturning) {
            // Returning to Pulilan Hub: from Delivery Destination back to Pulilan Central Hub
            const originPt = pHeldDest || pulilanCoords;
            riderRoute.push({ lat: originPt.lat, lng: originPt.lng });
            riderRoute.push({ lat: pulilanCoords.lat, lng: pulilanCoords.lng });
          } else if (isHeldPickupLeg) {
            // First-mile pickup leg: courier dispatched from Pulilan Hub to Merchant Pickup Point
            riderRoute.push({ lat: pulilanCoords.lat, lng: pulilanCoords.lng });
            if (pHeldPickup && Number.isFinite(pHeldPickup.lat) && Number.isFinite(pHeldPickup.lng)) {
              riderRoute.push({ lat: pHeldPickup.lat, lng: pHeldPickup.lng });
            } else {
              riderRoute.push({ lat: pulilanCoords.lat + 0.0001, lng: pulilanCoords.lng + 0.0001 });
            }
          } else if (isHeldDelivery) {
            // Logistics corridor: Pickup Point -> Pulilan Central Hub -> Delivery Destination
            if (pHeldPickup && pHeldDest) {
              riderRoute.push({ lat: pHeldPickup.lat, lng: pHeldPickup.lng });
              riderRoute.push({ lat: pulilanCoords.lat, lng: pulilanCoords.lng });
              riderRoute.push({ lat: pHeldDest.lat, lng: pHeldDest.lng });
            } else if (pHeldDest) {
              riderRoute.push({ lat: pulilanCoords.lat, lng: pulilanCoords.lng });
              riderRoute.push({ lat: pHeldDest.lat, lng: pHeldDest.lng });
            } else {
              riderRoute.push({ lat: pulilanCoords.lat, lng: pulilanCoords.lng });
            }
          } else {
            // No active parcels: parked at Pulilan Base Hub
            riderRoute.push({ lat: pulilanCoords.lat, lng: pulilanCoords.lng });
            riderRoute.push({ lat: pulilanCoords.lat + 0.0001, lng: pulilanCoords.lng + 0.0001 });
          }

          let taskProgress = 0;
          if (heldParcel) {
            const frac = Number(heldParcel.telemetry?.progressFraction);
            if (Number.isFinite(frac) && frac >= 0) {
              taskProgress = Math.min(1.0, frac);
            } else {
              const st = String(heldParcel.status || '').toLowerCase();
              if (st === 'to pickup') taskProgress = 0.0;
              else if (st === 'picked up') taskProgress = 0.15;
              else if (st === 'in transit' || st === 'shipping' || st === 'received at hub') taskProgress = 0.45;
              else if (st === 'out for delivery') taskProgress = 0.75;
              else if (st === 'returning' || st === 'returns' || st === 'failed' || st.includes('failed') || st === 'attempted' || st.includes('return')) taskProgress = 0.50;
              else if (st === 'delivered' || st === 'completed' || st === 'returned' || st.includes('returned') || st.includes('seller') || st === 'cancelled' || st === 'canceled') taskProgress = 1.0;
            }
          }

          return {
            riderId,
            fullName: r.riderName || '—',
            vehicleType: r.vehicleType || '',
            vehiclePlate: r.vehiclePlate || '',
            city: r.city || '',
            province: r.state || '',
            status: r.status || 'Active',
            isOnDuty: !!r.isOnDuty,
            lat, lng,
            hasRealGps,
            isLivePing,
            isReturningToHub,
            taskProgress,
            speedKmh: isReturningToHub ? 40 : (r.speedKmh || 35),
            destinationHubId: hub.hubId,
            heading: ping ? ping.heading : null,
            steppedAway: !!heldParcel && stepStateRef.current[heldParcel.trackingNumber] === 'departed',
          stepReturned: !!heldParcel && stepStateRef.current[heldParcel.trackingNumber] === 'returned',
            rawRoute: riderRoute,
            assignedStops,
          };
        });

      const allMappedParcels = safeParcels
        .map((p, i) => {
          const tn = p.trackingNumber || p.trackingId;
          const fix = telemetryByParcel[String(tn).toUpperCase()];
          const pickupCoords = getParcelPickupCoords(p);
          const destCoords = getParcelDeliveryCoords(p);
          const currentLoc = resolveParcelCurrentLocation(p);

          let lat = null;
          let lng = null;
          let hasRealGps = false;

          if (fix) {
            lat = fix.lat;
            lng = fix.lng;
            hasRealGps = true;
          } else if (currentLoc && currentLoc.lat !== null && currentLoc.lng !== null) {
            lat = currentLoc.lat;
            lng = currentLoc.lng;
            hasRealGps = true;
          } else if (pickupCoords) {
            lat = pickupCoords.lat;
            lng = pickupCoords.lng;
            hasRealGps = true;
          } else if (destCoords) {
            lat = destCoords.lat;
            lng = destCoords.lng;
            hasRealGps = true;
          } else {
            const coords = CITY_COORDS[p.destination] || CITY_COORDS[p.origin];
            if (coords) {
              lat = coords.lat + (i * 0.003);
              lng = coords.lng + (i * 0.0025);
            }
          }

          return {
            ...p,
            trackingNumber: tn,
            lat, lng,
            pickupLat: pickupCoords ? pickupCoords.lat : null,
            pickupLng: pickupCoords ? pickupCoords.lng : null,
            destLat: destCoords ? destCoords.lat : null,
            destLng: destCoords ? destCoords.lng : null,
            hasRealGps,
          };
        });

      // Fast path: Immediately populate riders with available cached routes or raw paths with 0 blocking delay
      const initialActiveRiders = rawRiders.map((r) => {
        const cached = routeCacheRef.current[r.riderId];
        return {
          ...r,
          route: (cached && Array.isArray(cached) && cached.length >= 2) ? cached : r.rawRoute,
          routeDistanceMeters: r.routeDistanceMeters || null,
          routeDurationSeconds: r.routeDurationSeconds || null,
        };
      });

      // Instantly render markers, pins, and parcels on the map
      setRiders(initialActiveRiders);
      setParcels(allMappedParcels);

      // Non-blocking background enhancement: calculate highway road geometry via OSRM without stalling UI
      Promise.all(
        rawRiders.map(async (r) => {
          try {
            const road = await fetchRoadRoute(r.rawRoute);
            if (road && road.points && road.points.length >= 2) {
              const updatedRoute = stableRoute(routeCacheRef.current, r.riderId, road.points);
              return {
                riderId: r.riderId,
                route: updatedRoute,
                routeDistanceMeters: road.distanceMeters,
                routeDurationSeconds: road.durationSeconds,
              };
            }
          } catch { /* ignore OSRM errors */ }
          return null;
        })
      ).then((enhanced) => {
        const validUpdates = enhanced.filter(Boolean);
        if (validUpdates.length > 0) {
          setRiders((prevRiders) =>
            prevRiders.map((pr) => {
              const match = validUpdates.find((u) => u.riderId === pr.riderId);
              if (!match || pr.route === match.route) return pr;
              return {
                ...pr,
                route: match.route,
                routeDistanceMeters: match.routeDistanceMeters,
                routeDurationSeconds: match.routeDurationSeconds,
              };
            })
          );
        }
      });
    } catch (err) {
      console.error('LiveRiderMap: backend unreachable —', err);
      setRiders([]);
      setParcels([]);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, []);

  // Debounced fetch scheduler: coalesces rapid-fire SSE bursts (location-synced + parcel-synced)
  const scheduleFetch = useCallback((delay = 200) => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = setTimeout(() => {
      fetchData();
    }, delay);
  }, [fetchData]);

  // Real-time SSE updates — refresh map when location/parcel events arrive
  const { on } = useSSE();
  useEffect(() => {
    const unsub1 = on('location-synced', () => scheduleFetch(100));
    const unsub2 = on('parcel-synced', () => scheduleFetch(100));
    const unsub3 = on('parcel-updated', () => scheduleFetch(100));
    const unsub4 = on('courier-step', (payload) => {
      const trackingNumber = payload && payload.trackingNumber;
      if (trackingNumber && (payload.event === 'departed' || payload.event === 'returned')) {
        stepStateRef.current[trackingNumber] = payload.event;
      }
      scheduleFetch(50);
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [on, scheduleFetch]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => scheduleFetch(0), LIVE_REFRESH_MS);
    return () => {
      clearInterval(interval);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [fetchData, scheduleFetch]);

  useEffect(() => {
    if (refreshTrigger) {
      scheduleFetch(0);
    }
  }, [refreshTrigger, scheduleFetch]);

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
        circle.on('click', () => { setSelectedHub(prev => prev === hub.hubId ? null : hub.hubId); });
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
          .on('click', () => { setSelectedHub(prev => prev === hub.hubId ? null : hub.hubId); })
          .addTo(map);
        hubMarkerRefs.current[hub.hubId] = hubMarker;
      });

      const bounds = LOGISTICS_HUBS.map(h => [h.coordinates.lat, h.coordinates.lng]);
      map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], maxZoom: 12 });

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

  useEffect(() => {
    Object.entries(hubCircleRefs.current).forEach(([id, circle]) => {
      const isSel = id === selectedHub;
      circle.setStyle({ weight: isSel ? 3.5 : 2, fillOpacity: isSel ? 0.16 : 0.07 });
    });
  }, [selectedHub]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current || !tileLayerRef.current) return;
    const L = LRef.current, map = mapRef.current;
    map.removeLayer(tileLayerRef.current);
    const choice = layers.satellite ? TILE_LAYERS.satellite : TILE_LAYERS.street;
    tileLayerRef.current = L.tileLayer(choice.url, { attribution: choice.attribution, maxZoom: 19 });
    tileLayerRef.current.addTo(map);
    tileLayerRef.current.bringToBack();
  }, [layers.satellite, mapReady]);

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
  });

  const hub = selectedHub ? hubMetrics.find(h => h.hubId === selectedHub) : null;
  const rider = selectedRider ? riders.find(r => r.riderId === selectedRider) : null;
  const riderDestHub = rider ? LOGISTICS_HUBS.find(h => h.hubId === rider.destinationHubId) : null;
  const riderParcels = rider ? parcels.filter(p => matchRider(p.riderId || p.rider, rider)) : [];

  // Filter options and matching logic
  const PARCEL_STATUS_FILTERS = [
    'Pending',
    'Confirmed',
    'To Pickup',
    'Picked Up',
    'In Transit',
    'Out for Delivery',
    'Delivered',
    'Returning',
    'Returned',
    'Failed Attempt',
    'Cancelled',
    'Received at Hub',
    'Returned to Hub',
    'Returned to Seller',
  ];

  // Canonical municipality options from the delivery zone directory
  // (scoped by the selected zone); replaces the old data-derived set so
  // the dropdown always offers real Bulacan towns even with sparse data.
  const availableCities = useMemo(() => {
    if (zoneFilter === 'all') return ALL_MUNICIPALITIES.slice();
    return municipalitiesOf(zoneFilter);
  }, [zoneFilter]);

  // Barangay options for the picked municipality. Empty for the 21/24
  // towns whose mapping is still pending professor sign-off — callers
  // hide the barangay dropdown in that case.
  const availableBarangays = useMemo(() => {
    if (locationFilter === 'all') return [];
    return barangaysOf(locationFilter);
  }, [locationFilter]);

  const visibleRiders = useMemo(() => {
    return riders.filter(r => {
      if (riderFilter !== 'all' && r.riderId !== riderFilter) return false;

      if (statusFilter !== 'all') {
        const courierParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const hasMatchingStatus = courierParcels.some(p => normalizeParcelStatus(p.status) === statusFilter);
        if (!hasMatchingStatus) return false;
      }

      if (locationFilter !== 'all') {
        const rTown = extractMunicipality(r.city) || extractMunicipality(r.province);
        const courierParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const inLoc = courierParcels.some(p =>
          extractMunicipality(p.origin) === locationFilter || extractMunicipality(p.destination) === locationFilter
        );
        if (rTown !== locationFilter && !inLoc) return false;
      }

      if (zoneFilter !== 'all') {
        const rZone = zoneForMunicipality(extractMunicipality(r.city) || extractMunicipality(r.province));
        const courierParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const inZone = courierParcels.some(p =>
          zoneForMunicipality(extractMunicipality(p.origin)) === zoneFilter ||
          zoneForMunicipality(extractMunicipality(p.destination)) === zoneFilter
        );
        if (rZone !== zoneFilter && !inZone) return false;
      }

      if (barangayFilter !== 'all') {
        const courierParcels = parcels.filter(p => matchRider(p.riderId || p.rider, r));
        const inBrgy = courierParcels.some(p =>
          sameBarangay(extractBarangayFromAddress(p.origin), barangayFilter) ||
          sameBarangay(extractBarangayFromAddress(p.destination), barangayFilter)
        );
        if (!sameBarangay(r.barangay, barangayFilter) && !inBrgy) return false;
      }

      return true;
    });
  }, [riders, parcels, riderFilter, statusFilter, locationFilter, zoneFilter, barangayFilter]);

  const visibleParcels = useMemo(() => {
    return parcels.filter(p => {
      if (riderFilter !== 'all') {
        const targetRider = riders.find(r => r.riderId === riderFilter);
        if (!targetRider || !matchRider(p.riderId || p.rider, targetRider)) return false;
      }

      if (statusFilter !== 'all' && normalizeParcelStatus(p.status) !== statusFilter) {
        return false;
      }

      if (locationFilter !== 'all') {
        const orig = extractMunicipality(p.origin);
        const dest = extractMunicipality(p.destination);
        if (orig !== locationFilter && dest !== locationFilter) return false;
      }

      if (zoneFilter !== 'all') {
        const origZone = zoneForMunicipality(extractMunicipality(p.origin));
        const destZone = zoneForMunicipality(extractMunicipality(p.destination));
        if (origZone !== zoneFilter && destZone !== zoneFilter) return false;
      }

      if (barangayFilter !== 'all') {
        const origBrgy = extractBarangayFromAddress(p.origin);
        const destBrgy = extractBarangayFromAddress(p.destination);
        if (!sameBarangay(origBrgy, barangayFilter) && !sameBarangay(destBrgy, barangayFilter)) return false;
      }

      return true;
    });
  }, [parcels, riders, riderFilter, statusFilter, locationFilter, zoneFilter, barangayFilter]);

  const activeParcelsForDrawer = useMemo(() => {
    return visibleParcels;
  }, [visibleParcels]);

  const handleSelectRiderFilter = (id) => {
    setRiderFilter(id);
    handleSelectRider(id === 'all' ? null : id);
  };

  const handleClearFilters = () => {
    setRiderFilter('all');
    setStatusFilter('all');
    setZoneFilter('all');
    setLocationFilter('all');
    setBarangayFilter('all');
    handleSelectRider(null);
  };

  const card = { background: 'white', borderRadius: 12, border: '1px solid rgba(57,9,85,0.09)', boxShadow: '0 2px 16px rgba(57,9,85,0.06)', overflow: 'hidden' };
  const statRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f5f0ff', fontSize: 13 };
  const layerBtn = (active) => ({ padding: '6px 14px', borderRadius: 'var(--yto-radius-button, 8px)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${active ? '#390955' : '#e0d5f0'}`, background: active ? '#390955' : 'white', color: active ? 'white' : '#555' });

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
            value={zoneFilter}
            onChange={(e) => { setZoneFilter(e.target.value); setLocationFilter('all'); setBarangayFilter('all'); }}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${zoneFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: zoneFilter !== 'all' ? '#390955' : 'white', color: zoneFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}
            aria-label="Filter map by delivery zone"
          >
            <option value="all">All zones</option>
            {allZoneIds().map(z => <option key={z} value={z}>{ZONE_LABELS[z]}</option>)}
          </select>
          <select
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); setBarangayFilter('all'); }}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${locationFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: locationFilter !== 'all' ? '#390955' : 'white', color: locationFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}
            aria-label="Filter by city location"
          >
            <option value="all">All locations</option>
            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {availableBarangays.length > 0 && (
            <select
              value={barangayFilter}
              onChange={(e) => setBarangayFilter(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: `1.5px solid ${barangayFilter !== 'all' ? '#390955' : '#e0d5f0'}`, background: barangayFilter !== 'all' ? '#390955' : 'white', color: barangayFilter !== 'all' ? 'white' : '#555', cursor: 'pointer' }}
              aria-label="Filter map by barangay"
            >
              <option value="all">All barangays</option>
              {availableBarangays.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {(riderFilter !== 'all' || statusFilter !== 'all' || zoneFilter !== 'all' || locationFilter !== 'all' || barangayFilter !== 'all') && (
            <button
              onClick={handleClearFilters}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 'var(--yto-radius-button, 8px)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', border: '1px solid #cbd5e1', background: 'white', color: '#475569', cursor: 'pointer' }}
            >
              <X size={12} aria-hidden="true" /> Clear Filters
            </button>
          )}
          {riderFilter !== 'all' && <span style={{ fontSize: 11, color: '#9b82b2' }}>Showing 1 of {riders.length} riders</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0 }}>
        <div style={{ position: 'relative', height: 480 }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a890c0', fontWeight: 600, fontSize: 14, background: 'white' }}>
              Loading Luzon map data...
            </div>
          )}
          <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />

          {/* Render Active Riders - Smooth real-time telemetry glide along delivery route */}
          {mapReady && !loading && visibleRiders.map(r => (
            <LiveGpsMarker
              key={r.riderId}
              L={LRef.current}
              map={mapRef.current}
              rider={r}
              isSelected={selectedRider === r.riderId}
              onSelect={(id) => handleSelectRider(selectedRider === id ? null : id)}
            />
          ))}

          {/* Render Active Parcel Stops (Pickup and Delivery Points) */}
          {mapReady && !loading && visibleParcels.map(p => {
            const isAssigned = selectedRider && matchRider(p.riderId || p.rider, { riderId: selectedRider });
            const selectedRiderObj = selectedRider ? riders.find(r => r.riderId === selectedRider) : null;
            const stop = selectedRiderObj?.assignedStops?.find(s => s.trackingNumber === p.trackingNumber);
            const stopNum = stop?.stopIndex || null;
            const isFocused = focusedStopTracking === p.trackingNumber;

            const st = String(p.status || '').toLowerCase();
            const isPickupLeg = ['pending', 'to ship', 'to pickup', 'processing', 'confirmed'].includes(st);

            return (
              <React.Fragment key={p.trackingNumber}>
                {p.pickupLat && p.pickupLng && (
                  <PickupPointMarker
                    L={LRef.current}
                    map={mapRef.current}
                    parcel={p}
                    isSelected={isAssigned || isFocused}
                    stopNumber={isPickupLeg && stop?.type === 'pickup' ? stopNum : null}
                    onSelect={() => {
                      if (p.riderId) handleSelectRider(p.riderId);
                      setFocusedStopTracking(p.trackingNumber);
                    }}
                  />
                )}
                {p.destLat && p.destLng && (
                  <DeliveryPointMarker
                    L={LRef.current}
                    map={mapRef.current}
                    parcel={p}
                    isSelected={isAssigned || isFocused}
                    stopNumber={stop?.type === 'delivery' ? stopNum : null}
                    onSelect={() => {
                      if (p.riderId) handleSelectRider(p.riderId);
                      setFocusedStopTracking(p.trackingNumber);
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

          <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1000, pointerEvents: 'none', background: 'rgba(255,255,255,0.96)', borderRadius: 9, padding: '8px 12px', border: '1px solid rgba(57,9,85,0.1)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { color: '#390955', label: 'Hub geofence & central station', shape: 'circle' },
              { color: '#390955', label: 'Active courier (with name badge)', shape: 'pin' },
              { color: '#059669', label: 'Pickup origin point (merchant)', shape: 'pickup' },
              { color: '#43a047', label: '100m doorstep delivery geofence', shape: 'fence' },
              { color: '#2563eb', label: 'Delivery destination point (doorstep)', shape: 'delivery' },
              { color: '#f37021', label: 'Active dispatch route', shape: 'line' },
            ].map(x => (
              <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, color: '#555' }}>
                {x.shape === 'circle'   && <div style={{ width: 9, height: 9, borderRadius: '50%', border: '2px dashed #390955', flexShrink: 0 }} />}
                {x.shape === 'fence'    && <div style={{ width: 9, height: 9, borderRadius: '50%', border: '2px dashed #43a047', background: 'rgba(67,160,71,0.15)', flexShrink: 0 }} />}
                {x.shape === 'pin'      && <div style={{ width: 9, height: 9, borderRadius: '50%', background: x.color, flexShrink: 0 }} />}
                {x.shape === 'pickup'   && <div style={{ width: 9, height: 9, borderRadius: '50%', background: x.color, flexShrink: 0 }} />}
                {x.shape === 'delivery' && <div style={{ width: 9, height: 9, borderRadius: '50%', background: x.color, flexShrink: 0 }} />}
                {x.shape === 'line'     && <div style={{ width: 14, height: 3, background: x.color, borderRadius: 2, flexShrink: 0 }} />}
                {x.label}
              </div>
            ))}
            <div style={{ fontSize: 9, opacity: 0.7, color: '#b45309' }}>
              Real GPS coordinates stream live from app status updates and route maps.
            </div>
          </div>
        </div>

        {/* Side detail panel */}
        <div style={{ borderLeft: '1px solid rgba(57,9,85,0.07)', padding: '16px 18px', maxHeight: 480, overflowY: 'auto' }}>
          {!hub && !rider && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', borderBottom: '1.5px solid rgba(57,9,85,0.08)', paddingBottom: 6, gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setSidePanelTab('hubs')}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    border: 'none',
                    background: 'none',
                    padding: '4px 2px',
                    cursor: 'pointer',
                    color: sidePanelTab === 'hubs' ? '#390955' : '#9b82b2',
                    borderBottom: sidePanelTab === 'hubs' ? '2.5px solid #390955' : '2.5px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Hubs ({hubMetrics.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanelTab('parcels')}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    border: 'none',
                    background: 'none',
                    padding: '4px 2px',
                    cursor: 'pointer',
                    color: sidePanelTab === 'parcels' ? '#390955' : '#9b82b2',
                    borderBottom: sidePanelTab === 'parcels' ? '2.5px solid #390955' : '2.5px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {statusFilter === 'all' ? 'Parcels' : `${statusFilter} Parcels`} ({activeParcelsForDrawer.length})
                </button>
              </div>

              {sidePanelTab === 'hubs' ? (
                <>
                  {hubMetrics.map(h => {
                    const colors = HUB_STATUS_COLORS[h.status] || { bg: '#e6f9ed', color: '#1e7e34', dot: '#22c55e' };
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
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeParcelsForDrawer.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#bbb', padding: '16px 0', textAlign: 'center' }}>
                      No parcels matching current filters.
                    </div>
                  ) : (
                    activeParcelsForDrawer.map(p => {
                      const isFocused = focusedStopTracking === p.trackingNumber;
                      const hasCourier = Boolean(p.riderId || p.rider);
                      const isPickup = ['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(String(p.status || '').toLowerCase());
                      return (
                        <div
                          key={p._id || p.trackingNumber}
                          onClick={() => {
                            setFocusedStopTracking(prev => prev === p.trackingNumber ? null : p.trackingNumber);
                            if (p.riderId) handleSelectRider(p.riderId);
                            if (mapRef.current) {
                              const target = (p.destLat && p.destLng)
                                ? [p.destLat, p.destLng]
                                : ((p.pickupLat && p.pickupLng) ? [p.pickupLat, p.pickupLng] : null);
                              if (target) mapRef.current.setView(target, 15, { animate: true });
                            }
                          }}
                          style={{
                            padding: '9px 11px',
                            background: isFocused ? '#f5eefc' : '#faf8ff',
                            border: `1.5px solid ${isFocused ? '#7c3aed' : 'rgba(57,9,85,0.1)'}`,
                            borderRadius: 8,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#f37021' }}>{p.trackingNumber}</span>
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 6,
                                background: hasCourier ? '#eff6ff' : '#fffbeb',
                                color: hasCourier ? '#1d4ed8' : '#b45309',
                              }}
                            >
                              {hasCourier ? 'ASSIGNED' : 'UNASSIGNED'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#1a0a2e', marginTop: 3, fontWeight: 600 }}>
                            {p.item || 'Package'} · <span style={{ color: getParcelStatusColor(p.status), fontWeight: 700 }}>{p.status}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                            {isPickup ? `Pickup: ${p.origin || 'Merchant'}` : `To: ${p.destination || 'Doorstep'}`}
                          </div>
                          <div style={{ fontSize: 9.5, color: isFocused ? '#7c3aed' : '#9b82b2', marginTop: 4, fontWeight: 700 }}>
                            {isFocused ? 'Focused on map' : 'Click to inspect & locate'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {hub && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a0a2e' }}>{hub.hubName}</div>
                <Tooltip content="Close hub details">
                <button onClick={() => setSelectedHub(null)} aria-label="Close hub details" style={{ width: 30, height: 30, borderRadius: 'var(--yto-radius-button, 8px)', border: '1.5px solid rgba(57,9,85,0.15)', background: 'white', cursor: 'pointer', color: '#9b82b2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} aria-hidden="true" /></button>
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
                <button onClick={() => handleSelectRider(null)} aria-label="Close rider details" style={{ width: 30, height: 30, borderRadius: 'var(--yto-radius-button, 8px)', border: '1.5px solid rgba(57,9,85,0.15)', background: 'white', cursor: 'pointer', color: '#9b82b2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} aria-hidden="true" /></button>
                </Tooltip>
              </div>
              <div style={{ fontSize: 11, color: '#9b82b2', marginBottom: 12, fontFamily: 'monospace' }}>{rider.riderId}</div>
              <div style={statRow}><span style={{ color: '#888' }}>Vehicle Type</span><span style={{ fontWeight: 700 }}>{rider.vehicleType}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Live Status</span><span style={{ fontWeight: 700, color: rider.hasRealGps ? '#16a34a' : '#b45309' }}>{rider.hasRealGps ? '● Live GPS position' : '● Approximate (city-level)'}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Current Location</span><span style={{ fontWeight: 700 }}>{rider.city || '—'}</span></div>
              <div style={statRow}><span style={{ color: '#888' }}>Destination Hub</span><span style={{ fontWeight: 700, color: '#f37021' }}>{riderDestHub?.hubName || '—'}</span></div>
              {rider.routeDistanceMeters && rider.routeDistanceMeters > 0 && (
                <div style={statRow}><span style={{ color: '#888' }}>Road Distance</span><span style={{ fontWeight: 700, color: '#f37021' }}>{(rider.routeDistanceMeters / 1000).toFixed(1)} km</span></div>
              )}

              {/* Delivery Progress Bar */}
              {riderParcels.length > 0 && (() => {
                const total = riderParcels.length;
                const delivered = riderParcels.filter(p => ['delivered', 'completed'].includes(String(p.status || '').toLowerCase())).length;
                const inTransit = riderParcels.filter(p => ['in transit', 'out for delivery', 'picked up'].includes(String(p.status || '').toLowerCase())).length;
                const pendingPickup = riderParcels.filter(p => ['pending', 'to ship', 'to pickup', 'confirmed', 'processing'].includes(String(p.status || '').toLowerCase())).length;
                const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
                return (
                  <div style={{ marginTop: 12, marginBottom: 12, padding: '10px 12px', background: '#faf8ff', borderRadius: 8, border: '1px solid rgba(57,9,85,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Delivery Progress
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: pct === 100 ? '#10b981' : '#f37021' }}>
                        {pct}% Completed
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: '#e2d8f2', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #f37021 0%, #390955 100%)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 10, color: '#64748b' }}>
                      <span>{delivered} of {total} delivered</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {inTransit > 0 && <span style={{ color: '#2563eb', fontWeight: 600 }}>{inTransit} in transit</span>}
                        {pendingPickup > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{pendingPickup} to collect</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#390955', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Connected Stops ({riderParcels.length})
                </div>
                {riderParcels.length > 1 && (
                  <button
                    onClick={() => {
                      setFocusedStopTracking(null);
                      if (mapRef.current && LRef.current) {
                        const points = [[rider.lat, rider.lng]];
                        riderParcels.forEach(p => {
                          if (p.pickupLat && p.pickupLng) points.push([p.pickupLat, p.pickupLng]);
                          if (p.destLat && p.destLng) points.push([p.destLat, p.destLng]);
                        });
                        mapRef.current.fitBounds(LRef.current.latLngBounds(points), { padding: [70, 70], maxZoom: 15, animate: true });
                      }
                    }}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '6px 14px',
                      borderRadius: 'var(--yto-radius-button, 8px)',
                      border: '1.5px solid #390955',
                      background: !focusedStopTracking ? '#390955' : 'white',
                      color: !focusedStopTracking ? 'white' : '#390955',
                      cursor: 'pointer',
                    }}
                  >
                    All Connected Routes
                  </button>
                )}
              </div>
              {riderParcels.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0' }}>No parcels currently assigned to this rider.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {riderParcels.map((p, idx) => {
                    const isFocused = focusedStopTracking === p.trackingNumber;
                    const isPickup = ['pending', 'to ship', 'to pickup'].includes(String(p.status || '').toLowerCase());
                    const stopNumber = idx + 1;
                    return (
                      <div
                        key={p._id || p.trackingNumber}
                        onClick={() => {
                          setFocusedStopTracking(prev => prev === p.trackingNumber ? null : p.trackingNumber);
                          if (mapRef.current && LRef.current) {
                            const targetCoords = isPickup
                              ? (p.pickupLat && p.pickupLng ? [p.pickupLat, p.pickupLng] : null)
                              : (p.destLat && p.destLng ? [p.destLat, p.destLng] : null);
                            if (targetCoords) {
                              mapRef.current.setView(targetCoords, 15, { animate: true });
                            }
                          }
                        }}
                        style={{
                          padding: '10px 12px',
                          background: isFocused ? '#f5eefc' : '#faf8ff',
                          border: `1.5px solid ${isFocused ? '#7c3aed' : 'rgba(57,9,85,0.1)'}`,
                          borderRadius: 9,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                background: isPickup ? '#047857' : '#1d4ed8',
                                color: 'white',
                                fontSize: 10,
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {stopNumber}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#f37021' }}>{p.trackingNumber}</span>
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: isPickup ? '#ecfdf5' : '#eff6ff',
                              color: isPickup ? '#047857' : '#1d4ed8',
                            }}
                          >
                            {isPickup ? 'PICKUP' : 'DELIVERY'}
                          </span>
                        </div>

                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0a2e', marginTop: 4 }}>
                          {p.item || 'Package'}
                        </div>

                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                          {isPickup ? `Sender: ${p.senderName || 'Merchant'} · ${p.origin || ''}` : `Recipient: ${p.receiverName || 'Customer'} · ${p.destination || ''}`}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, borderTop: '1px dashed rgba(57,9,85,0.08)', paddingTop: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#390955' }}>
                            Status: <span style={{ color: '#f37021' }}>{p.status}</span>
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: isFocused ? '#7c3aed' : '#9b82b2' }}>
                            {isFocused ? 'Focused on map' : 'Click to focus'}
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
      </div>
    </div>
  );
}
