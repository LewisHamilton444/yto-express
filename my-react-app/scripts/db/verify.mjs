// SH-08 Verify: compare record counts between production and the restored
// test database, so the restore can be shown to be complete.
// Usage (from my-react-app/):
//   node scripts/db/verify.mjs            print the comparison table
//   node scripts/db/verify.mjs --cleanup  delete the yto_restore_test database afterwards
// (frees Atlas free-tier storage; production is never touched)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server');
const require = createRequire(path.join(serverDir, 'package.json'));
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // same as Server.js
require('dotenv').config({ path: path.join(serverDir, '.env'), quiet: true });
const mongoose = require('mongoose');

const RESTORE_DB = 'yto_restore_test';
const COLLECTIONS = ['accounts', 'sellers', 'riders', 'parcels'];

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is not set in server/.env');
  process.exit(1);
}
const sourceDb = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace('/', '') || 'test';
if (sourceDb === RESTORE_DB) {
  console.error(`Refusing to continue: production database is named '${RESTORE_DB}'.`);
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
const client = mongoose.connection.getClient();
const source = client.db(sourceDb);
const restored = client.db(RESTORE_DB);

if (process.argv.includes('--cleanup')) {
  await restored.dropDatabase();
  console.log(`Deleted test database '${RESTORE_DB}'. Production '${sourceDb}' was not touched.`);
  await mongoose.disconnect();
  process.exit(0);
}

const rows = [];
let allMatch = true;
for (const name of COLLECTIONS) {
  const [a, b] = await Promise.all([
    source.collection(name).countDocuments(),
    restored.collection(name).countDocuments(),
  ]);
  const match = a === b;
  if (!match) allMatch = false;
  rows.push({ Collection: name, [`Original (${sourceDb})`]: a, [`Restored (${RESTORE_DB})`]: b, Match: match ? '✅ yes' : '❌ NO' });
}

console.log(`\nBackup/restore verification — ${new Date().toLocaleString()}\n`);
console.table(rows);
console.log(allMatch
  ? '\nRESULT: ✅ All record counts match. The backup restored completely.\n'
  : '\nRESULT: ❌ Counts differ. Re-run backup.sh then restore-test.sh.\n');

await mongoose.disconnect();
process.exit(allMatch ? 0 : 1);
