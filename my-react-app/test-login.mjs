import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:3001';

const accounts = [
  { email: 'staff@ytoexpress.com', password: 'e7bnbvcjQm8p', role: 'staff' },
  { email: 'hub@ytoexpress.com', password: 'V7O0y66BvPtz', role: 'hub' },
  { email: 'superadmin@ytoexpress.com', password: 'HftOs1v97v4p', role: 'super_admin' },
];

const resultsPath = resolve('test-login-results.json');

function snapshot(results) {
  const obj = {
    started: new Date().toISOString(),
    base: BASE,
    results,
  };
  writeFileSync(resultsPath, JSON.stringify(obj, null, 2));
}

async function login(account, index) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  let res;
  try {
    res = await fetch(`${BASE}/api/accounts/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const result = {
      index,
      email: account.email,
      role: account.role,
      status: null,
      ok: false,
      latencyMs: Date.now() - startTime,
      error: err.name === 'AbortError' ? 'TIMEOUT_AFTER_7S' : err.message,
      body: null,
    };
    snapshot([...resultsSnapshot, result]);
    throw new Error('done');
  }
  let body;
  try {
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 1000) };
    }
  } catch (err) {
    body = { _parse_error: err.message };
  }
  clearTimeout(timer);
  const result = {
    index,
    email: account.email,
    role: account.role,
    status: res.status,
    ok: res.ok,
    latencyMs: Date.now() - startTime,
    body,
  };
  snapshot([...resultsSnapshot, result]);
  return result;
}

let resultsSnapshot = [];
async function main() {
  snapshot([]);
  for (let i = 0; i < accounts.length; i++) {
    try {
      await login(accounts[i], i);
    } catch {
      break;
    }
  }
}

main().catch(() => {});
