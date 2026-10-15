// ============================================================================
// I-6: bidirectional bridge reconciler (Web portal side).
// ----------------------------------------------------------------------------
// Mirror of the Android backend's yto_express_backend/utils/bridgeReconcile.js.
// It polls the app backend's GET /api/bridge/poll-changes and applies only
// REMOTE-NEWER + CONTENT-DIFFERENT records back into this backend through its
// own key-gated /api/bridge endpoints. The dual condition is the loop-killer:
// an apply always bumps the local updatedAt, so the next poll sees either a
// non-newer remote (last-writer-wins) or identical content — never both.
//
// The other direction (portal edits reaching the app) is served by the
// reshaped GET /api/bridge/poll-changes, which the Android reconciler polls.
//
// Endpoint mapping here:
//   parcel (field deltas) → POST /api/bridge/sync-parcel
//   parcel (status only)  → POST /api/bridge/receive-status — it validates the
//                           status vocabulary, appends the timeline event,
//                           audits the rider-app change and counts a Delivered
//                           delivery; a status-only sync-parcel would skip all
//                           of that.
//   user                  → POST /api/bridge/sync-user
//   issue                 → POST /api/bridge/sync-issue
//
// Rules this module enforces (each one exists because the naive version
// misbehaved):
//   - Only NON-BLANK remote values are compared AND written. The app's wire
//     always carries '' for unset strings; treating that as a value would blank
//     a richer portal profile, and comparing it would re-apply forever (the
//     write would keep discarding it).
//   - Only fields the receiving endpoint actually writes are part of a diff
//     gate. A field the endpoint ignores would diff forever.
//   - A parcel missing here is CREATED (real parcels originate in the app); a
//     user or ticket missing here is SKIPPED, matching the app-side rule that
//     never resurrects a row an administrator removed.
//   - selfPost calls this backend's own endpoints over loopback, so every
//     validation/projection the live path uses (rider identity resolution,
//     attempt translation, SSE broadcast) applies to pulled data too.
//   - Demo accounts are filtered out defensively on every collection.
//   - Rate valve (5 applies / 10 min / key) is a backstop only — the content
//     diff is the primary loop guard.
//   - Single-flight: concurrent runOnce() calls short-circuit.
// ============================================================================

const http = require('http');
const BridgeClient = require('./BridgeClient');
const Parcel = require('../models/Parcel');
const Seller = require('../models/Seller');
const Rider = require('../models/Rider');
const Customer = require('../models/Customer');
const Issue = require('../models/Issue');

// Canonical mobile demo logins — mirrors DEMO_SYNC_EMAILS in bridgeRoutes.js.
const DEMO_POLL_EMAILS = ['customer@gmail.com', 'seller@gmail.com', 'rider@gmail.com'];

// The status vocabulary POST /receive-status accepts (see bridgeRoutes.js).
// A remote status outside it is skipped rather than coerced.
const PARCEL_STATUSES = [
  'Pending', 'To Ship', 'Confirmed', 'Processing', 'To Pickup', 'Picked Up',
  'In Transit', 'Out for Delivery', 'Delivered', 'Failed', 'Returning',
  'Returned', 'Cancelled',
];

// This backend's Issue enum. The app also has which has no
// equivalent here — such a ticket is skipped and logged, never re-labelled
// (a product decision, not a translation this module may make).
// 'Rejected' added 2026-10-12: the mobile app can deny a claim (A Issue enum
// includes it), and without an equivalent here a rejected ticket was SKIPPED
// on apply and logged, so a portal admin kept seeing the old status forever.
const ISSUE_STATUSES = ['Open', 'Under Investigation', 'Resolved', 'Rejected', 'Closed'];

// Wire field → local field, per role. ONLY these are diffed, because they are
// exactly what POST /sync-user writes back.
const USER_WIRE_FIELDS = {
  seller: [
    ['name', 'fullName'], ['phone', 'phone'], ['address', 'address'], ['city', 'city'],
    ['storeName', 'storeName'], ['warehouseAddress', 'warehouseAddress'],
    ['operatingHours', 'operatingHours'], ['idNumber', 'idNumber'], ['idType', 'idType'],
  ],
  rider: [
    ['name', 'riderName'], ['phone', 'phone'], ['address', 'address'], ['city', 'city'],
    ['vehicleModel', 'vehicleType'], ['plateNumber', 'vehiclePlate'], ['assignedHub', 'assignedHub'],
  ],
  customer: [
    ['name', 'fullName'], ['phone', 'phone'], ['address', 'address'], ['city', 'city'],
    ['deliveryInstructions', 'deliveryInstructions'],
  ],
};

const ROLE_MODEL = { seller: Seller, rider: Rider, customer: Customer };

const BOOT_WINDOW_MS = 15 * 60 * 1000;
const RUN_INTERVAL_MS = 60 * 1000;
const CURSOR_OVERLAP_MS = 1000;
const VALVE_MAX = 5;
const VALVE_WINDOW_MS = 10 * 60 * 1000;

const state = {
  cursor: null,
  inFlight: false,
  started: false,
  timer: null,
  failStreak: 0,
};

const valve = new Map();

// ── Small shared helpers ────────────────────────────────────────────────

const isNonBlank = (v) => v !== undefined && v !== null && String(v).trim() !== '';

function isDemoEmail(email) {
  if (!email) return false;
  return DEMO_POLL_EMAILS.includes(String(email).trim().toLowerCase());
}

const digits = (v) => String(v === undefined || v === null ? '' : v).replace(/\D/g, '');

// Same normalization the two backends' sanitizeBridgePhone uses (strip
// non-digits, then a leading 63 / 0), so a formatted number ('+63 917 000
// 0001') is not mistaken for a changed one ('9170000001').
function phoneKey(v) {
  let p = digits(v);
  if (p.startsWith('63')) p = p.slice(2);
  if (p.startsWith('0')) p = p.slice(1);
  return p;
}

function sameDate(a, b) {
  const x = a ? new Date(a).getTime() : null;
  const y = b ? new Date(b).getTime() : null;
  if (x !== null && Number.isNaN(x)) return true; // unusable remote date: not a difference
  return x === y;
}

// Copies over only non-blank values — the rule that keeps a sparse delta from
// blanking a richer record on either side.
function nonBlank(source, keys) {
  const out = {};
  for (const k of keys) {
    if (isNonBlank(source?.[k])) out[k] = source[k];
  }
  return out;
}

// ── Gates ───────────────────────────────────────────────────────────────

// Remote strictly newer than local. Missing/invalid remote timestamp = not
// newer (skip); missing local timestamp = older (apply wins).
function newerThan(remoteTs, localTs) {
  const r = remoteTs ? new Date(remoteTs).getTime() : NaN;
  const l = localTs ? new Date(localTs).getTime() : 0;
  if (Number.isNaN(r)) return false;
  return r > l;
}

// Next cursor = max remote updatedAt minus a 1s overlap so a record written
// exactly on the boundary is never missed. Zero records -> null (no advance).
function nextCursor(maxUpdatedAt) {
  if (!maxUpdatedAt) return null;
  const t = maxUpdatedAt instanceof Date ? maxUpdatedAt.getTime() : new Date(maxUpdatedAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t - CURSOR_OVERLAP_MS);
}

function valveAllows(key, now = Date.now()) {
  const arr = (valve.get(key) || []).filter((t) => now - t < VALVE_WINDOW_MS);
  if (arr.length >= VALVE_MAX) {
    valve.set(key, arr);
    return false;
  }
  arr.push(now);
  valve.set(key, arr);
  return true;
}

// Pure gate: true only when applying `remote` would actually change `local`.
// `riderTarget`: undefined = key absent or unresolvable (skip), null =
// unassign, else a Rider registrationId.
function parcelDiffers(remote, local, riderTarget) {
  if (!remote) return false;
  if (!local) return true;

  if (isNonBlank(remote.status)) {
    const status = String(remote.status).trim();
    if (!PARCEL_STATUSES.includes(status)) return false; // vocabulary we cannot store
    if (status !== (local.status || '')) return true;
  }

  if (isNonBlank(remote.senderName) && remote.senderName !== (local.senderName || '')) return true;
  if (isNonBlank(remote.receiverName) && remote.receiverName !== (local.receiverName || '')) return true;
  if (isNonBlank(remote.destination) && remote.destination !== (local.destination || '')) return true;
  if (isNonBlank(remote.origin) && remote.origin !== (local.origin || '')) return true;
  if (isNonBlank(remote.item) && remote.item !== (local.item || '')) return true;

  if (isNonBlank(remote.weight)) {
    const w = parseFloat(remote.weight);
    if (Number.isFinite(w) && w !== parseFloat(local.weight)) return true;
  }
  if (isNonBlank(remote.notes) && remote.notes !== (local.notes || '')) return true;
  if (isNonBlank(remote.recipientEmail) && remote.recipientEmail !== (local.recipientEmail || '')) return true;
  if (isNonBlank(remote.sellerEmail) && remote.sellerEmail !== (local.senderEmail || '')) return true;
  if (phoneKey(remote.senderPhone) && phoneKey(remote.senderPhone) !== phoneKey(local.senderPhone)) return true;
  if (phoneKey(remote.recipientPhone) && phoneKey(remote.recipientPhone) !== phoneKey(local.receiverPhone)) return true;

  if (remote.deliveryFee !== undefined && remote.deliveryFee !== null
    && Number(remote.deliveryFee) !== Number(local.deliveryFee || 0)) return true;

  if (isNonBlank(remote.packageType) && remote.packageType !== (local.packageType || '')) return true;

  if (remote.estimatedDeliveryDate !== undefined && !sameDate(remote.estimatedDeliveryDate, local.estimatedDeliveryDate)) return true;
  if (remote.actualDeliveryDate !== undefined && !sameDate(remote.actualDeliveryDate, local.actualDeliveryDate)) return true;

  if (remote.dimensions && typeof remote.dimensions === 'object') {
    for (const k of ['length', 'width', 'height']) {
      const v = Number(remote.dimensions[k]);
      if (Number.isFinite(v) && v !== (Number(local.dimensions?.[k]) || 0)) return true;
    }
  }

  if (isNonBlank(remote.podPhoto) && remote.podPhoto !== (local.podPhoto || '')) return true;

  if (Array.isArray(remote.deliveryAttempts) && remote.deliveryAttempts.length) {
    const localAttempts = Array.isArray(local.deliveryAttempts) ? local.deliveryAttempts : [];
    if (remote.deliveryAttempts.length > localAttempts.length) return true;
    const lastRemote = remote.deliveryAttempts[remote.deliveryAttempts.length - 1];
    const lastLocal = localAttempts[localAttempts.length - 1];
    if (
      lastRemote?.attemptedAt && lastLocal?.attemptedAt
      && new Date(lastRemote.attemptedAt).getTime() !== new Date(lastLocal.attemptedAt).getTime()
    ) {
      return true;
    }
  }

  if (riderTarget !== undefined) {
    const localRider = local.riderId ? String(local.riderId) : null;
    const target = riderTarget === null ? null : String(riderTarget);
    if (localRider !== target) return true;
  }

  return false;
}

// Pure gate over the /sync-user write projection for the given role.
function userDiffers(updates, local, role) {
  if (!updates || !local) return false;
  const fields = USER_WIRE_FIELDS[role];
  if (!fields) return false;

  for (const [wire, localField] of fields) {
    const remote = updates[wire];
    if (!isNonBlank(remote)) continue;
    if (wire === 'phone') {
      if (phoneKey(remote) !== phoneKey(local[localField])) return true;
      continue;
    }
    if (String(remote) !== String(local[localField] ?? '')) return true;
  }
  return false;
}

// Pure gate over the /sync-issue write projection (non-blank remote values
// only, exactly what the apply writes back).
function issueDiffers(remote, local) {
  if (!remote || !local) return false;
  if (isNonBlank(remote.status) && String(remote.status).trim() !== (local.status || '')) return true;
  for (const k of ['adminNotes', 'description', 'category', 'productName', 'productCategory', 'eta']) {
    if (isNonBlank(remote[k]) && String(remote[k]) !== String(local[k] ?? '')) return true;
  }
  return false;
}

// ── Loopback self-post ──────────────────────────────────────────────────

function selfPost(path, body, apiKey) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: process.env.PORT || 3001,
        path,
        method: 'POST',
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-bridge-api-key': apiKey,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.write(payload);
    req.end();
  });
}

function logWarn(msg) {
  console.warn(`[BridgeReconcile:web] ${msg}`);
}

function logInfo(msg) {
  console.log(`[BridgeReconcile:web] ${msg}`);
}

function preflight() {
  const apiKey = process.env.BRIDGE_API_KEY;
  if (!apiKey) return { ok: false, error: 'bridge key not configured (BRIDGE_API_KEY)' };
  if (typeof BridgeClient.isBridgeEnabled !== 'function' || !BridgeClient.isBridgeEnabled()) {
    return { ok: false, error: 'ANDROID_BACKEND_URL not set' };
  }
  return { ok: true, apiKey };
}

// ── Apply helpers ───────────────────────────────────────────────────────

// The parcel fields /sync-parcel can carry, in the wire's names.
const PARCEL_WIRE_FIELDS = [
  'senderName', 'receiverName', 'senderPhone', 'recipientPhone', 'sellerEmail',
  'recipientEmail', 'item', 'weight', 'origin', 'destination', 'notes', 'podPhoto',
  'packageType', 'deliveryFee', 'estimatedDeliveryDate', 'actualDeliveryDate',
  'dimensions', 'deliveryAttempts',
];

async function applyParcel(remote, local, riderTarget, apiKey, stats) {
  const trackingNumber = String(remote.trackingNumber || remote.trackingId || '').trim().toUpperCase();

  const body = { trackingId: trackingNumber, ...nonBlank(remote, PARCEL_WIRE_FIELDS) };
  // The endpoint requires the identity trio; a delta that omits one (or a
  // brand-new row) takes it from the stored row so validation always passes.
  if (local) {
    for (const k of ['senderName', 'receiverName', 'item']) {
      if (!isNonBlank(body[k]) && isNonBlank(local[k])) body[k] = local[k];
    }
  }
  // Courier identity: the wire carries riderEmail; sync-parcel resolves it to
  // this backend's Rider.registrationId (never a foreign id).
  if (riderTarget !== undefined) {
    if (riderTarget === null) {
      body.riderEmail = '';
    } else {
      // riderTarget is a Rider.registrationId (see the batched email map).
      const rider = await Rider.findOne({ registrationId: riderTarget }).select('email').lean();
      if (rider?.email) body.riderEmail = rider.email;
    }
  }

  const isCreate = !local;
  if (!isCreate) {
    // Status is applied through receive-status (validated + audited + counted);
    // sending it here too would duplicate the timeline event.
    delete body.status;
  }

  const resp = await selfPost('/api/bridge/sync-parcel', body, apiKey);
  if (resp.status >= 200 && resp.status < 300) {
    stats.parcelApplied += 1;
  } else {
    stats.parcelSkipped += 1;
    logWarn(`sync-parcel ${trackingNumber} -> ${resp.status || resp.error}`);
    return false;
  }

  if (!isCreate && isNonBlank(remote.status)) {
    const status = String(remote.status).trim();
    if (status !== (local.status || '')) {
      const statusBody = { trackingNumber, status };
      if (isNonBlank(remote.podPhoto)) statusBody.podPhoto = remote.podPhoto;
      const statusResp = await selfPost('/api/bridge/receive-status', statusBody, apiKey);
      if (statusResp.status >= 200 && statusResp.status < 300) {
        stats.parcelStatusApplied += 1;
      } else {
        logWarn(`receive-status ${trackingNumber} -> ${statusResp.status || statusResp.error}`);
      }
    }
  }
  return true;
}

async function applyUser(remote, local, role, apiKey, stats) {
  const email = String(remote.email || '').toLowerCase().trim();
  // The endpoint requires name/email/role; a delta without a name uses the
  // stored one so an update never has to invent data.
  const name = isNonBlank(remote.updates.name)
    ? remote.updates.name
    : (role === 'rider' ? local.riderName : local.fullName);
  if (!isNonBlank(name)) {
    stats.userSkipped += 1;
    logWarn(`user ${email} has no name on either side - skipped (endpoint would 400)`);
    return false;
  }

  const body = {
    email,
    role,
    name,
    ...nonBlank(remote.updates, Object.keys(remote.updates).filter((k) => k !== 'name')),
  };
  const resp = await selfPost('/api/bridge/sync-user', body, apiKey);
  if (resp.status >= 200 && resp.status < 300) {
    stats.userApplied += 1;
    return true;
  }
  stats.userSkipped += 1;
  logWarn(`sync-user ${email} -> ${resp.status || resp.error}`);
  return false;
}

async function applyIssue(remote, local, status, apiKey, stats) {
  const ticketId = String(local.ticketId || remote.ticketId || '').trim().toUpperCase();
  const body = {
    ticketId,
    trackingNumber: isNonBlank(remote.trackingNumber) ? remote.trackingNumber : local.trackingNumber,
    ...nonBlank(remote, ['status', 'adminNotes', 'description', 'category', 'reporterName', 'reporterEmail', 'reporterPhone', 'reporterRole', 'productName', 'productCategory', 'eta']),
  };
  if (status) body.status = status;

  const resp = await selfPost('/api/bridge/sync-issue', body, apiKey);
  if (resp.status >= 200 && resp.status < 300) {
    stats.issueApplied += 1;
    return true;
  }
  stats.issueSkipped += 1;
  logWarn(`sync-issue ${ticketId} -> ${resp.status || resp.error}`);
  return false;
}

// ── Main pass ───────────────────────────────────────────────────────────

async function runOnce() {
  const cfg = preflight();
  if (!cfg.ok) return { ok: false, error: cfg.error };
  if (state.inFlight) return { ok: false, error: 'reconcile already running' };
  state.inFlight = true;

  try {
    if (!state.cursor) {
      state.cursor = new Date(Date.now() - BOOT_WINDOW_MS);
      logInfo(`boot window cursor ${state.cursor.toISOString()}`);
    }

    const remote = await BridgeClient.pollChanges(state.cursor.toISOString());
    if (!remote.success) {
      state.failStreak += 1;
      if (state.failStreak === 3 || (state.failStreak > 3 && state.failStreak % 10 === 0)) {
        logWarn(`app backend unreachable for ${state.failStreak} consecutive polls: ${remote.error}`);
      }
      return { ok: false, error: remote.error };
    }
    state.failStreak = 0;

    const wire = (remote.data && remote.data.data) || {};
    const parcels = wire.parcels || wire.shipments || [];
    const users = wire.users || [];
    const issues = wire.issues || [];

    let maxRemote = null;
    const seen = (ts) => {
      if (!ts) return;
      const t = new Date(ts);
      if (!Number.isNaN(t.getTime()) && (!maxRemote || t > maxRemote)) maxRemote = t;
    };

    // One batched rider lookup for the whole batch: riderEmail -> registrationId.
    const riderEmails = [...new Set(
      parcels.map((p) => String(p.riderEmail || '').toLowerCase().trim()).filter(Boolean)
    )];
    const riderRows = riderEmails.length
      ? await Rider.find({ email: { $in: riderEmails } }).select('email registrationId').lean()
      : [];
    const riderIdByEmail = new Map(
      riderRows.map((r) => [String(r.email).toLowerCase(), String(r.registrationId)])
    );

    const stats = {
      parcelApplied: 0, parcelSkipped: 0, parcelStatusApplied: 0,
      userApplied: 0, userSkipped: 0,
      issueApplied: 0, issueSkipped: 0,
      valveBlocked: 0,
    };

    for (const p of parcels) {
      seen(p.updatedAt);
      const trackingNumber = String(p.trackingNumber || p.trackingId || '').trim().toUpperCase();
      if (!trackingNumber || isDemoEmail(p.sellerEmail) || isDemoEmail(p.recipientEmail)) {
        stats.parcelSkipped += 1;
        continue;
      }
      let riderTarget;
      if (Object.prototype.hasOwnProperty.call(p, 'riderEmail')) {
        const email = String(p.riderEmail || '').toLowerCase().trim();
        riderTarget = email ? (riderIdByEmail.get(email) || undefined) : null;
      }
      const local = await Parcel.findOne({ trackingNumber }).lean();
      if (local && !newerThan(p.updatedAt, local.updatedAt)) {
        stats.parcelSkipped += 1;
        continue;
      }
      if (!parcelDiffers(p, local, riderTarget)) {
        stats.parcelSkipped += 1;
        continue;
      }
      const key = `parcel:${trackingNumber.toLowerCase()}`;
      if (!valveAllows(key)) {
        stats.valveBlocked += 1;
        logWarn(`rate valve blocked apply for ${trackingNumber}`);
        continue;
      }
      await applyParcel(p, local, riderTarget, cfg.apiKey, stats);
    }

    for (const u of users) {
      seen(u.updatedAt);
      const email = String(u.email || '').toLowerCase().trim();
      const role = String(u.role || '').toLowerCase();
      if (!email || isDemoEmail(email) || !u.updates || !ROLE_MODEL[role]) {
        stats.userSkipped += 1;
        continue;
      }
      const local = await ROLE_MODEL[role].findOne({ email }).lean();
      if (!local) {
        // Never resurrect a record an administrator removed on this side.
        stats.userSkipped += 1;
        logWarn(`user ${email} not present here - skipped (sync-user would create it)`);
        continue;
      }
      if (!newerThan(u.updatedAt, local.updatedAt) || !userDiffers(u.updates, local, role)) {
        stats.userSkipped += 1;
        continue;
      }
      const key = `user:${email}`;
      if (!valveAllows(key)) {
        stats.valveBlocked += 1;
        logWarn(`rate valve blocked apply for user ${email}`);
        continue;
      }
      await applyUser(u, local, role, cfg.apiKey, stats);
    }

    for (const i of issues) {
      seen(i.updatedAt);
      const ticketId = String(i.ticketId || '').trim().toUpperCase();
      if (!ticketId || isDemoEmail(i.reporterEmail)) {
        stats.issueSkipped += 1;
        continue;
      }
      const local = await Issue.findOne({ ticketId }).lean();
      if (!local) {
        stats.issueSkipped += 1;
        logWarn(`ticket ${ticketId} not present here - skipped (sync-issue would create it)`);
        continue;
      }
      const status = isNonBlank(i.status) ? String(i.status).trim() : null;
      if (status && !ISSUE_STATUSES.includes(status)) {
        stats.issueSkipped += 1;
        logWarn(`ticket ${ticketId} status "${status}" has no equivalent here - left unchanged`);
        continue;
      }
      if (!newerThan(i.updatedAt, local.updatedAt) || !issueDiffers(i, local)) {
        stats.issueSkipped += 1;
        continue;
      }
      const key = `issue:${ticketId}`;
      if (!valveAllows(key)) {
        stats.valveBlocked += 1;
        logWarn(`rate valve blocked apply for ticket ${ticketId}`);
        continue;
      }
      await applyIssue(i, local, status, cfg.apiKey, stats);
    }

    if (maxRemote) {
      const next = nextCursor(maxRemote);
      if (next) state.cursor = next;
    }
    // Zero records -> cursor untouched (never advance an empty window).

    const applied = stats.parcelApplied + stats.userApplied + stats.issueApplied;
    if (applied > 0 || stats.valveBlocked > 0) {
      logInfo(`run complete: ${applied} applied, ${stats.valveBlocked} valve-blocked`);
    }
    return { ok: true, ...stats, cursor: state.cursor ? state.cursor.toISOString() : null };
  } finally {
    state.inFlight = false;
  }
}

async function runOnceSafe() {
  try {
    return await runOnce();
  } catch (err) {
    logWarn(`run failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function scheduleNext() {
  state.timer = setTimeout(async () => {
    await runOnceSafe();
    if (state.started) scheduleNext();
  }, RUN_INTERVAL_MS);
  if (state.timer.unref) state.timer.unref();
}

// Started only from Server.js (never under NODE_ENV=test); runOnce() also
// self-gates on config, so a keyless process never touches the app backend.
function start() {
  if (state.started) return;
  state.started = true;
  logInfo('starting 60s poll loop');
  runOnceSafe().then(() => {
    if (state.started) scheduleNext();
  });
}

function stop() {
  state.started = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

module.exports = {
  runOnce,
  start,
  stop,
  // Pure gates exported for scripts/qa/bridgeReconcileGates.js.
  parcelDiffers,
  userDiffers,
  issueDiffers,
  newerThan,
  nextCursor,
  // The issue status vocabulary, exported so the gate script can assert it
  // covers every status the mobile app can emit (a status missing here is
  // silently skipped on apply, which is how 'Rejected' stayed invisible).
  ISSUE_STATUSES,
};
