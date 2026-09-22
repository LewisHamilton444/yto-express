// Local dev launcher, mock-backend variant: starts the QA seed server
// (scripts/qa/seedServer.mjs) instead of the real server/Server.js, and
// points the Vite frontend at it via VITE_API_URL. Every admin view reads
// GET /api/parcels, /riders, /sellers, /customers, /issues, /dashboard/stats
// through the same apiFetch() the real backend answers — the seed server
// just answers those routes itself, with realistic linked rows (40 parcels,
// 12 riders, 8 sellers, 14 customers, 14 issues — see seedServer.mjs).
//
// Use this when you want every table/stat/list populated without a live
// MongoDB or the deployed backend: `npm run dev:mock`, then log into the
// portal with any email/password (the seed server's /accounts/login accepts
// anything and returns a super_admin session).
//
// This intentionally does NOT touch any src/ file: per AGENTS2.md §7 the
// client renders real API data with clean empty states and zero synthetic
// rows of its own. Swapping the backend for this dev session, rather than
// hardcoding fixtures into the components, keeps that contract intact —
// nothing here can leak into a production/UAT build.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSeedServer } from './qa/seedServer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173;

let shuttingDown = false;
let frontend = null;
let seed = null;

function killTree(pid) {
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[dev:mock] Stopping...');
  if (frontend) killTree(frontend.pid);
  if (seed) await seed.close();
  setTimeout(() => process.exit(0), 200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

seed = await startSeedServer();
const apiUrl = `http://localhost:${seed.port}`;

frontend = spawn(
  process.execPath,
  [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--port', String(FRONTEND_PORT), '--strictPort'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_API_URL: apiUrl } },
);
frontend.on('error', (err) => {
  console.error(`[dev:mock] Failed to start frontend: ${err.message}`);
  shutdown();
});
frontend.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`[dev:mock] frontend exited with code ${code}${signal ? ` (${signal})` : ''}.`);
  }
  shutdown();
});

console.log(`\n[dev:mock] YTO web dev stack (MOCK backend — synthetic seed data, dev only)
  Mock API: ${apiUrl}/
  Frontend: http://localhost:${FRONTEND_PORT}/
  Log in with any email + any password.
  Press Ctrl+C to stop both.
\n`);
