const AuditLog = require('../models/AuditLog');

// Records one security audit entry (SH-09).
//
// Safety rules:
//  - Never throws and never makes the real request wait: callers do not await
//    it, and any database error is caught and printed to the server console.
//  - Only the named fields below are saved. The request body is never copied
//    in, so passwords, tokens and keys cannot leak into the log. Callers must
//    put only hand-picked values in `details` (e.g. { from: 'staff', to: 'super_admin' }).
//
// The actor defaults to the signed-in admin (req.user, set by authenticateToken);
// pass `actor` to override it (login, where nobody is signed in yet, and
// rider-app events, which come from the bridge rather than a person).
function logAudit(req, { action, target = '', result = 'success', details = {}, actor, source = 'admin_panel' }) {
  try {
    const who = actor || req.user || {};
    return AuditLog.create({
      actorId: String(who.id || ''),
      actorEmail: who.email || '',
      actorRole: who.role || 'anonymous',
      source,
      action,
      target: String(target || ''),
      result,
      ip: req.ip || '',
      details,
    }).catch((err) => console.error('[Audit] Could not write audit entry:', err.message));
  } catch (err) {
    console.error('[Audit] Could not write audit entry:', err.message);
    return Promise.resolve();
  }
}

module.exports = { logAudit };
