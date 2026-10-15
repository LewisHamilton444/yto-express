const mongoose = require('mongoose');

let appDbConnection = null;
let changeStreamsActive = false;

/**
 * Initializes direct connection to the mobile application database (yto_express).
 * Enables real-time change stream monitoring and direct telemetry reads.
 *
 * @param {Object} sseBroadcaster - SSE broadcaster instance for live client push
 */
function initAppDatabase(sseBroadcaster) {
  const uri = process.env.APP_MONGO_URI;
  if (!uri || !uri.trim()) {
    console.log('[App DB] APP_MONGO_URI not configured. Direct App DB sync disabled.');
    return;
  }

  try {
    const conn = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 15000,
    });

    conn.on('connected', () => {
      console.log('[App DB] Successfully connected directly to Mobile App Database (yto_express).');
      appDbConnection = conn;
      if (sseBroadcaster) {
        startAppDbChangeStreams(conn, sseBroadcaster);
      }
    });

    conn.on('error', (err) => {
      console.warn('[App DB] Connection warning:', err.message);
    });

    conn.on('disconnected', () => {
      console.warn('[App DB] Disconnected from Mobile DB. Change streams paused.');
      changeStreamsActive = false;
    });
  } catch (err) {
    console.warn('[App DB] Failed to initialize connection:', err.message);
  }
}

/**
 * Attaches Change Streams to the Mobile DB's shipments and users collections.
 * Whenever the mobile app writes a status change or GPS ping, Web Admin broadcasts SSE instantly.
 */
function startAppDbChangeStreams(conn, sseBroadcaster) {
  if (changeStreamsActive) return;
  changeStreamsActive = true;

  try {
    const shipmentsWatch = conn.collection('shipments').watch([], { fullDocument: 'updateLookup' });
    shipmentsWatch.on('change', (change) => {
      try {
        const doc = change.fullDocument;
        if (!doc || !doc.trackingId) return;

        const trackingNumber = String(doc.trackingId).trim();
        const status = doc.status || 'Pending';
        const tele = doc.telemetry || {};
        const riderLat = tele.riderLat !== undefined && tele.riderLat !== null ? Number(tele.riderLat) : null;
        const riderLng = tele.riderLng !== undefined && tele.riderLng !== null ? Number(tele.riderLng) : null;

        if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
          sseBroadcaster.broadcast('location-synced', {
            parcelId: trackingNumber,
            lat: riderLat,
            lng: riderLng,
            progressFraction: tele.progressFraction !== undefined ? Number(tele.progressFraction) : 0,
            activeLeg: tele.activeLeg || 'TO_DELIVERY',
            timestamp: tele.lastUpdated ? new Date(tele.lastUpdated).toISOString() : new Date().toISOString(),
          });
        }

        sseBroadcaster.broadcast('parcel-synced', {
          trackingNumber,
          status,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[App DB ChangeStream:shipments] event error:', e.message);
      }
    });

    shipmentsWatch.on('error', (err) => {
      console.warn('[App DB ChangeStream:shipments] stream error:', err.message);
      changeStreamsActive = false;
    });

    const usersWatch = conn.collection('users').watch([], { fullDocument: 'updateLookup' });
    usersWatch.on('change', (change) => {
      try {
        const doc = change.fullDocument;
        if (!doc || String(doc.role).toLowerCase() !== 'rider') return;

        const riderId = doc.webEnterpriseId || doc.enterpriseId || String(doc._id);
        const lat = Number(doc.lastRiderLat);
        const lng = Number(doc.lastRiderLng);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          sseBroadcaster.broadcast('location-synced', {
            riderId,
            lat,
            lng,
            recordedAt: doc.lastRiderFixAt ? new Date(doc.lastRiderFixAt).toISOString() : new Date().toISOString(),
          });
        }
      } catch (e) {
        console.warn('[App DB ChangeStream:users] event error:', e.message);
      }
    });

    usersWatch.on('error', (err) => {
      console.warn('[App DB ChangeStream:users] stream error:', err.message);
    });

    console.log('[App DB] Change streams active: instant mobile-to-web telemetry enabled.');
  } catch (err) {
    console.warn('[App DB] Change streams initialization skipped:', err.message);
    changeStreamsActive = false;
  }
}

/**
 * Enriches parcel objects with live status and telemetry from the Mobile App Database.
 */
async function enrichParcelsFromAppDb(parcels) {
  if (!appDbConnection || !Array.isArray(parcels) || parcels.length === 0) return parcels;

  try {
    const appShipments = await appDbConnection.collection('shipments').find({}).toArray();
    if (!Array.isArray(appShipments) || appShipments.length === 0) return parcels;

    const map = new Map();
    appShipments.forEach((s) => {
      if (s.trackingId) {
        map.set(String(s.trackingId).toUpperCase().trim(), s);
      }
    });

    return parcels.map((p) => {
      const tn = String(p.trackingNumber || p.trackingId || '').toUpperCase().trim();
      const live = map.get(tn);
      if (!live) return p;

      const tele = live.telemetry || {};
      const riderLat = Number(tele.riderLat);
      const riderLng = Number(tele.riderLng);
      const hasCoords = Number.isFinite(riderLat) && Number.isFinite(riderLng);

      const pickupCoords = Array.isArray(live.pickupCoordinates?.coordinates) && live.pickupCoordinates.coordinates.length >= 2
        ? { lng: live.pickupCoordinates.coordinates[0], lat: live.pickupCoordinates.coordinates[1] }
        : null;

      const destCoords = Array.isArray(live.deliveryCoordinates?.coordinates) && live.deliveryCoordinates.coordinates.length >= 2
        ? { lng: live.deliveryCoordinates.coordinates[0], lat: live.deliveryCoordinates.coordinates[1] }
        : null;

      return {
        ...p,
        status: live.status || p.status,
        riderLat: hasCoords ? riderLat : p.riderLat,
        riderLng: hasCoords ? riderLng : p.riderLng,
        pickupLat: pickupCoords ? pickupCoords.lat : p.pickupLat,
        pickupLng: pickupCoords ? pickupCoords.lng : p.pickupLng,
        destLat: destCoords ? destCoords.lat : p.destLat,
        destLng: destCoords ? destCoords.lng : p.destLng,
        telemetry: {
          riderLat: hasCoords ? riderLat : (p.telemetry?.riderLat ?? null),
          riderLng: hasCoords ? riderLng : (p.telemetry?.riderLng ?? null),
          progressFraction: tele.progressFraction !== undefined ? Number(tele.progressFraction) : (p.telemetry?.progressFraction ?? 0),
          activeLeg: tele.activeLeg || p.telemetry?.activeLeg || 'TO_DELIVERY',
          lastUpdated: tele.lastUpdated || p.telemetry?.lastUpdated || null,
        },
      };
    });
  } catch (err) {
    console.warn('[App DB] enrichParcels error:', err.message);
    return parcels;
  }
}

/**
 * Enriches parcel location records with live status and telemetry from the Mobile App Database.
 */
async function enrichParcelLocationsFromAppDb(locations) {
  if (!appDbConnection || !Array.isArray(locations) || locations.length === 0) return locations;

  try {
    const appShipments = await appDbConnection.collection('shipments').find({}).toArray();
    if (!Array.isArray(appShipments) || appShipments.length === 0) return locations;

    const map = new Map();
    appShipments.forEach((s) => {
      if (s.trackingId) {
        map.set(String(s.trackingId).toUpperCase().trim(), s);
      }
    });

    return locations.map((loc) => {
      const tn = String(loc.parcelId || '').toUpperCase().trim();
      const live = map.get(tn);
      if (!live) return loc;

      const tele = live.telemetry || {};
      const riderLat = Number(tele.riderLat);
      const riderLng = Number(tele.riderLng);

      if (Number.isFinite(riderLat) && Number.isFinite(riderLng)) {
        return {
          ...loc,
          lat: String(riderLat),
          lng: String(riderLng),
          status: live.status || loc.status,
          updatedAt: tele.lastUpdated ? new Date(tele.lastUpdated) : loc.updatedAt,
        };
      }
      return { ...loc, status: live.status || loc.status };
    });
  } catch (err) {
    console.warn('[App DB] enrichParcelLocations error:', err.message);
    return locations;
  }
}

/**
 * Enriches rider documents with latest live GPS fixes from the Mobile App Database.
 */
async function enrichRidersFromAppDb(riders) {
  if (!appDbConnection || !Array.isArray(riders) || riders.length === 0) return riders;

  try {
    const appUsers = await appDbConnection.collection('users').find({ role: 'rider' }).toArray();
    if (!Array.isArray(appUsers) || appUsers.length === 0) return riders;

    const userById = new Map();
    appUsers.forEach((u) => {
      if (u._id) userById.set(String(u._id), u);
      if (u.webEnterpriseId) userById.set(String(u.webEnterpriseId), u);
      if (u.email) userById.set(String(u.email).toLowerCase(), u);
    });

    return riders.map((r) => {
      const regId = String(r.registrationId || r.riderId || '').trim();
      const email = String(r.email || '').toLowerCase().trim();
      const mongoId = String(r._id || '').trim();

      const liveUser = userById.get(regId) || userById.get(mongoId) || userById.get(email);
      if (!liveUser) return r;

      const lat = Number(liveUser.lastRiderLat);
      const lng = Number(liveUser.lastRiderLng);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const recordedAt = liveUser.lastRiderFixAt ? new Date(liveUser.lastRiderFixAt) : new Date();
        const existingRecorded = r.lastLocation?.recordedAt ? new Date(r.lastLocation.recordedAt) : null;

        if (!existingRecorded || recordedAt >= existingRecorded) {
          return {
            ...r,
            lastLocation: {
              lat,
              lng,
              recordedAt,
              heading: r.lastLocation?.heading ?? null,
            },
          };
        }
      }
      return r;
    });
  } catch (err) {
    console.warn('[App DB] enrichRiders error:', err.message);
    return riders;
  }
}

function getAppDb() {
  return appDbConnection;
}

module.exports = {
  initAppDatabase,
  enrichParcelsFromAppDb,
  enrichParcelLocationsFromAppDb,
  enrichRidersFromAppDb,
  getAppDb,
};
