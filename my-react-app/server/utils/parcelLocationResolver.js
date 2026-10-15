/**
 * parcelLocationResolver.js
 *
 * Single authoritative source of truth for resolving a parcel's current
 * physical position, address description, and facility type across its lifecycle.
 *
 * Lifecycle Rules:
 *  1. Pending / To Ship / Confirmed / Processing / To Pickup:
 *     The parcel is physically located at the Seller's store / warehouse / pickup origin.
 *     Coordinates: pickupLat / pickupLng (origin).
 *     Location: origin address.
 *     Type: 'Warehouse'
 *
 *  2. Picked Up / In Transit / Out for Delivery / Returning:
 *     The parcel is in motion with the courier / regional hub.
 *     - If live courier GPS fix is reported (riderLat / riderLng): uses rider coords.
 *     - If no live fix yet:
 *       - Out for delivery: approaches destination.
 *       - Picked up / In transit: in transit from origin.
 *
 *  3. Delivered:
 *     The parcel has arrived at the recipient's doorstep.
 *     Coordinates: delivery coordinates (trackingGeofence.center or deliveryCoordinates).
 *     Location: destination address.
 *     Type: 'Delivery Point'
 *
 *  4. Returned / Cancelled:
 *     The parcel remains at or returned to the seller's pickup origin.
 *     Coordinates: pickupLat / pickupLng.
 *     Location: origin address.
 *     Type: 'Warehouse'
 */

function extractCoords(val) {
  if (!val) return null;
  if (Array.isArray(val) && val.length === 2) {
    const c0 = Number(val[0]);
    const c1 = Number(val[1]);
    if (Number.isFinite(c0) && Number.isFinite(c1) && (c0 !== 0 || c1 !== 0)) {
      if (c0 > 50 && c1 < 50) return { lat: c1, lng: c0 }; // [lng, lat]
      if (c0 < 50 && c1 > 50) return { lat: c0, lng: c1 }; // [lat, lng]
      return { lat: c1, lng: c0 };
    }
  }
  if (val.coordinates && Array.isArray(val.coordinates) && val.coordinates.length === 2) {
    const c0 = Number(val.coordinates[0]);
    const c1 = Number(val.coordinates[1]);
    if (Number.isFinite(c0) && Number.isFinite(c1) && (c0 !== 0 || c1 !== 0)) {
      if (c0 > 50 && c1 < 50) return { lat: c1, lng: c0 }; // [lng, lat]
      if (c0 < 50 && c1 > 50) return { lat: c0, lng: c1 }; // [lat, lng]
      return { lat: c1, lng: c0 };
    }
  }
  if (val.lat !== undefined && val.lng !== undefined) {
    const lat = Number(val.lat);
    const lng = Number(val.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      if (lat > 50 && lng < 50) return { lat: lng, lng: lat };
      return { lat, lng };
    }
  }
  return null;
}

function resolveParcelCurrentLocation(parcel) {
  if (!parcel) {
    return { lat: null, lng: null, location: 'Pulilan Central Hub', type: 'Warehouse', stage: 'none' };
  }

  const status = (parcel.status || 'Pending').toString().trim().toLowerCase();

  // Extract Pickup / Origin Coordinates
  let pickup = null;
  if (Number.isFinite(parcel.pickupLat) && Number.isFinite(parcel.pickupLng) && (parcel.pickupLat !== 0 || parcel.pickupLng !== 0)) {
    pickup = { lat: Number(parcel.pickupLat), lng: Number(parcel.pickupLng) };
  } else {
    pickup = extractCoords(parcel.pickupCoordinates);
  }

  // Extract Destination / Delivery Coordinates
  let dest = null;
  if (parcel.trackingGeofence?.center) {
    dest = extractCoords(parcel.trackingGeofence.center);
  }
  if (!dest) {
    dest = extractCoords(parcel.deliveryCoordinates);
  }
  if (!dest && Number.isFinite(parcel.lat) && Number.isFinite(parcel.lng) && (parcel.lat !== 0 || parcel.lng !== 0)) {
    dest = { lat: Number(parcel.lat), lng: Number(parcel.lng) };
  }

  // Extract Live Rider Fix
  let rider = null;
  if (Number.isFinite(parcel.riderLat) && Number.isFinite(parcel.riderLng) && (parcel.riderLat !== 0 || parcel.riderLng !== 0)) {
    rider = { lat: Number(parcel.riderLat), lng: Number(parcel.riderLng) };
  }

  const originAddr = parcel.origin || 'Seller Warehouse';
  const destAddr = parcel.destination || 'Delivery Point';

  // 1. Pre-pickup / Pickup stages: parcel is sitting with the seller at the origin
  const prePickupStatuses = ['pending', 'to ship', 'confirmed', 'processing', 'to pickup'];
  if (prePickupStatuses.includes(status)) {
    if (pickup) {
      return {
        lat: pickup.lat,
        lng: pickup.lng,
        location: originAddr,
        type: 'Warehouse',
        stage: 'pickup',
      };
    }
  }

  // 2. Active in-flight transit / courier custody
  const inFlightStatuses = ['picked up', 'in transit', 'out for delivery', 'returning'];
  if (inFlightStatuses.includes(status)) {
    if (rider) {
      return {
        lat: rider.lat,
        lng: rider.lng,
        location: status === 'out for delivery'
          ? (parcel.destination ? `Out for Delivery (${destAddr})` : 'Out for Delivery')
          : `In Transit (${originAddr} → ${destAddr})`,
        type: status === 'out for delivery' ? 'Delivery Point' : 'Distribution',
        stage: status === 'out for delivery' ? 'doorstep' : 'transit',
      };
    }
    if (status === 'out for delivery' && dest) {
      return {
        lat: dest.lat,
        lng: dest.lng,
        location: destAddr,
        type: 'Delivery Point',
        stage: 'doorstep',
      };
    }
    if (pickup) {
      return {
        lat: pickup.lat,
        lng: pickup.lng,
        location: `In Transit from ${originAddr}`,
        type: 'Distribution',
        stage: 'transit',
      };
    }
  }

  // 3. Delivered stage: parcel is delivered at recipient's destination
  if (status === 'delivered') {
    if (dest) {
      return {
        lat: dest.lat,
        lng: dest.lng,
        location: destAddr,
        type: 'Delivery Point',
        stage: 'delivered',
      };
    }
    if (rider) {
      return {
        lat: rider.lat,
        lng: rider.lng,
        location: destAddr,
        type: 'Delivery Point',
        stage: 'delivered',
      };
    }
  }

  // 4. Returned or Cancelled stage
  if (['returned', 'cancelled'].includes(status)) {
    if (pickup) {
      return {
        lat: pickup.lat,
        lng: pickup.lng,
        location: status === 'returned' ? `Returned to ${originAddr}` : originAddr,
        type: 'Warehouse',
        stage: 'returned',
      };
    }
  }

  // 5. Fallback cascade:
  const resolvedCoords = rider || pickup || dest;
  if (resolvedCoords) {
    return {
      lat: resolvedCoords.lat,
      lng: resolvedCoords.lng,
      location: (resolvedCoords === dest ? destAddr : originAddr),
      type: resolvedCoords === dest ? 'Delivery Point' : 'Warehouse',
      stage: 'fallback',
    };
  }

  return {
    lat: null,
    lng: null,
    location: originAddr || destAddr || 'Pulilan Central Hub',
    type: 'Warehouse',
    stage: 'none',
  };
}

module.exports = {
  extractCoords,
  resolveParcelCurrentLocation,
};
