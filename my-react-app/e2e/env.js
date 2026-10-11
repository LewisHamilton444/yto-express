// Settings for the Playwright tests, read from the environment — never
// hardcoded. Put local values in e2e/.env.e2e (git-ignored; copy
// e2e/.env.e2e.example). Needs Node 21.7 or newer (process.loadEnvFile, util.parseEnv).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));

const localEnvFile = path.join(here, '.env.e2e');
if (existsSync(localEnvFile)) process.loadEnvFile(localEnvFile);

// Website under test. Live by default; http://localhost:5173 for local runs.
export const BASE_URL = (process.env.E2E_BASE_URL || 'https://yto-express-web.onrender.com').replace(/\/$/, '');

// Backend the tests send mock GPS pings to. Must be the backend that
// BASE_URL reads from (live by default; http://localhost:3001 for local runs).
export const API_URL = (process.env.E2E_API_URL || 'https://yto-express-backend.onrender.com').replace(/\/$/, '');

// Admin login for the map tests (super admin — only it can open #/geofence).
export const E2E_EMAIL = process.env.E2E_EMAIL || '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || '';

// Bridge key for the GPS route: E2E_BRIDGE_API_KEY if set, otherwise the
// BRIDGE_API_KEY already in server/.env. Only that one value is read.
function bridgeKeyFromServerEnv() {
  const serverEnv = path.join(here, '..', 'server', '.env');
  if (!existsSync(serverEnv)) return '';
  return parseEnv(readFileSync(serverEnv, 'utf8')).BRIDGE_API_KEY || '';
}
export const BRIDGE_API_KEY = process.env.E2E_BRIDGE_API_KEY || bridgeKeyFromServerEnv();

// Saved login session (git-ignored). Written by auth.setup.js.
export const AUTH_FILE = path.join(here, '.auth', 'admin.json');

// Set E2E_SLOW=1 to also run the real 60-second stale-signal wait.
export const RUN_SLOW_TESTS = process.env.E2E_SLOW === '1';
