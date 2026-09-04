// Local dev launcher: starts both the API server (server/) and the Vite
// frontend (root) from a single command. No extra dependencies (node:child_process.
// Usage:  npm start        (or: node scripts/dev.js)
// Stopping:  Ctrl+C kills both (tree kill on Windows, SIGTERM elsewhere).

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const serverDir = path.join(root, 'server');
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173;
const BACKEND_PORT = process.env.PORT || 3001;

let shuttingDown = false;
let backend = null;
let frontend = null;

function killTree(pid) {
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[dev:all] Stopping both processes...');
  if (backend) killTree(backend.pid);
  if (frontend) killTree(frontend.pid);
  setTimeout(() => process.exit(0), 200);
}

function start(name, args, cwd) {
  console.log(`[dev:all] Starting ${name}...`);
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
  child.on('error', (err) => {
    console.error(`[dev:all] Failed to start ${name}: ${err.message}`);
    if (name === 'backend') { console.error('[dev:all]   Check: server/.env exists and MONGO_URI is set (node Server.js now prints a clear error if not).'); }
    shutdown();
  });
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev:all] ${name} exited with code ${code}${signal ? ` (${signal})` : ''}.`);
    }
    shutdown();
  });
  return child;
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

backend = start('backend', ['Server.js'], serverDir);
frontend = start('frontend', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--port', String(FRONTEND_PORT), '--strictPort'], root);

console.log(`\n[dev:all] YTO web dev stack
  API:      http://localhost:${BACKEND_PORT}/
  Frontend: http://localhost:${FRONTEND_PORT}/
  Press Ctrl+C to stop both.
\n`);