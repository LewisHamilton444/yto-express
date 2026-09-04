// ============================================================================
// ROTATE DEMO ADMIN CREDENTIALS - one-off maintenance script
// ----------------------------------------------------------------------------
// Replaces any PLAINTEXT password on the three canonical demo admin accounts
// with a bcrypt hash of the new password, then audits the whole Account
// collection for any other non-bcrypt (legacy plaintext) rows.
//
// Safety gates (all required, or the script exits without connecting):
//   MONGO_URI          - target database (from server/.env or environment)
//   ROTATE_CONFIRM=YES - explicit human confirmation
//
// New password source, per account (same contract as the Server.js bootstrap
// and the seed script):
//   DEMO_ADMIN_PASSWORD_SUPERADMIN / _STAFF / _HUB  (env vars)
//   fallback: a random password is generated and logged ONCE
//
// Run: ROTATE_CONFIRM=YES node rotate_demo_admin_credentials.js
// ============================================================================
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const Account = require('./models/Account');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[Rotate Error] MONGO_URI is required. Set it in server/.env or the environment.');
  process.exit(1);
}
if (process.env.ROTATE_CONFIRM !== 'YES') {
  console.error('[Rotate Error] Refusing to run without explicit confirmation. Re-run with ROTATE_CONFIRM=YES.');
  process.exit(1);
}

const DEMO_ADMINS = [
  { email: 'superadmin@gmail.com', passwordEnv: 'DEMO_ADMIN_PASSWORD_SUPERADMIN' },
  { email: 'staff@gmail.com',      passwordEnv: 'DEMO_ADMIN_PASSWORD_STAFF' },
  { email: 'hub@gmail.com',        passwordEnv: 'DEMO_ADMIN_PASSWORD_HUB' },
];
const isBcrypt = (v) => typeof v === 'string' && /^\$2[aby]\$/.test(v);

async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('[Rotate] Connected to MongoDB.');

  let rotated = 0, alreadyHashed = 0, missing = 0;
  for (const admin of DEMO_ADMINS) {
    const account = await Account.findOne({ email: admin.email }).lean();
    if (!account) { missing++; console.log('[Rotate] ' + admin.email + ': account not found (skipped).'); continue; }
    if (isBcrypt(account.password)) { alreadyHashed++; console.log('[Rotate] ' + admin.email + ': password already bcrypt-hashed (skipped).'); continue; }
    let plainPassword = process.env[admin.passwordEnv];
    if (!plainPassword || !plainPassword.trim()) {
      plainPassword = crypto.randomBytes(12).toString('base64url');
      console.log('[Rotate] ' + admin.email + ': no ' + admin.passwordEnv + ' set. Generated a one-time password (record it now): ' + plainPassword);
    }
    const passwordHash = await bcrypt.hash(plainPassword.trim(), 10);
    // updateOne bypasses the pre-save hook, so the bcrypt hash is stored as-is
    // (running the hash back through Account.save() would double-hash it).
    await Account.updateOne({ email: admin.email }, { $set: { password: passwordHash } });
    rotated++;
    console.log('[Rotate] ' + admin.email + ': plaintext password replaced with bcrypt hash.');
  }

  const legacy = await Account.find({ password: { $exists: true, $not: /^\$2[aby]\$/ } }).select('email role status').lean();
  console.log('[Rotate] Plaintext audit: ' + legacy.length + ' account(s) with non-bcrypt passwords remain.');
  legacy.forEach((a) => console.log('[Rotate]   - ' + a.email + ' (' + (a.role || 'no role') + ', ' + (a.status || 'no status') + ')'));

  console.log('[Rotate] Done. rotated=' + rotated + ' alreadyHashed=' + alreadyHashed + ' missing=' + missing);
  await mongoose.disconnect();
}

main().catch((err) => { console.error('[Rotate Error]', err.message); process.exit(1); });