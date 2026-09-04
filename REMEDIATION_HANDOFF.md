# REMEDIATION HANDOFF - N1/N2 Emergency Security Batch (2026-09-04)

> Read this fully before acting. Do not improvise. Do not print secret values.

## 0. Snapshot

| Item | Value |
|---|---|
| Local repo | C:\Users\ADMIN\React_Projects\YTO Latest (branch main @ c7e0e15, tree clean) |
| Remote | https://github.com/LewisHamilton444/yto-express (origin/main @ b6c89fc - OLD, force-push required and intended) |
| Live backend | https://yto-express.onrender.com (Render + MongoDB Atlas) |
| Rotation script | my-react-app/server/rotate_demo_admin_credentials.js (gated: ROTATE_CONFIRM=YES) |
| Secrets source | my-react-app/server/.env (untracked - JWT_SECRET, BRIDGE_API_KEY, DEMO_ADMIN_PASSWORD_* already rotated there; MONGO_URI still old until Atlas rotation) |
| GitHub account | LewisHamilton444 (repo owner - must be the sign-in identity) |

## 1. What is ALREADY DONE (committed in c7e0e15 - do NOT redo)

- Server.js demo bootstrap is now opt-in (ENABLE_DEMO_BOOTSTRAP=1 + ALLOW_DEMO_BOOTSTRAP_IN_PROD=1 under NODE_ENV=production), bcrypt-only, passwords from DEMO_ADMIN_PASSWORD_* env vars. All hardcoded plaintext admin credentials removed.
- seed_official_demo_accounts.js and clean_web_db.js: hardcoded Atlas connection string removed (MONGO_URI now required from env), DEMO_PLAINTEXT mode removed.
- rotate_demo_admin_credentials.js created (re-hashes plaintext demo admin passwords, audits Account collection for other non-bcrypt rows).
- AGENTS2.md: passwords redacted, sections updated, remediation status added.
- Local .env secrets rotated: JWT_SECRET (new 64-char), BRIDGE_API_KEY + ANDROID_BRIDGE_API_KEY (new shared value, already synced to the mobile backend WEB_BRIDGE_API_KEY), DEMO_ADMIN_PASSWORD_* added.
- All four server files pass node --check.

## 2. Safety rules (absolute)

1. NEVER run rotate_demo_admin_credentials.js until Step 4 detector shows the NEW backend is live (401). The old deployed backend cannot verify bcrypt - rotating early locks every demo admin out.
2. Never print secret values into logs/chat/commits. Read them from .env programmatically when needed.
3. Never commit .env. Never amend/rebase existing commits. Never touch unrelated files.
4. Work only inside this repo. Do not run npm install or change dependencies.

## 3. Execution order

### Step 1 - Verify starting state
    git -C <repo> log -1            # must show c7e0e15 on main
    git -C <repo> status --short    # must be empty
    git -C <repo> ls-remote --heads origin   # must show b6c89fc on main

### Step 2 - Force-push (GitHub sign-in as LewisHamilton444)
Kill stale credential processes first, then push. A "Connect to GitHub" window appears:
Sign in with your browser as LewisHamilton444 and Authorize. The cached token is
read-only; this consent upgrades it to push scope (one-time).
    git push --force origin main
Verify: git ls-remote --heads origin now shows c7e0e15 on main. If push fails with a
permissions error, the wrong account was used - redo the sign-in with the owner account.

### Step 3 - Pre-set Render environment variables (dashboard.render.com)
In the web service Environment tab, add/update:
    JWT_SECRET      = value of JWT_SECRET from my-react-app/server/.env
    BRIDGE_API_KEY  = value of BRIDGE_API_KEY from my-react-app/server/.env
Leave MONGO_URI unchanged for now. Saving triggers a redeploy - expected.

### Step 4 - Wait for the NEW backend to go live
Poll (404 = old backend, 401 = NEW backend live; poll every 20s, up to 15 min):
    curl.exe -s -o NUL -w "%{http_code}" https://yto-express.onrender.com/api/customers
If it never flips: Render auto-deploy is off - trigger Manual Deploy from the Render
dashboard, keep polling. DO NOT proceed to Step 5 until you see 401.

### Step 5 - Rotate the production demo admin passwords
From my-react-app/server:
    $env:ROTATE_CONFIRM = 'YES'
    node rotate_demo_admin_credentials.js
Expected: "rotated=3" for superadmin@gmail.com / staff@gmail.com / hub@gmail.com
(re-hashed to bcrypt from DEMO_ADMIN_PASSWORD_* in .env) plus a plaintext audit list.
If the audit lists OTHER non-bcrypt accounts, report them - do not fix unilaterally.

### Step 6 - Verify the cutover
    POST https://yto-express.onrender.com/api/accounts/login
    {"email":"superadmin@gmail.com","password":"admin123"}   -> expect 401
    {"email":"staff@gmail.com","password":"staff123"}        -> expect 401
    superadmin@gmail.com + DEMO_ADMIN_PASSWORD_SUPERADMIN value -> expect 200 + token
    GET /api/bridge/health -> 200
(Read the new password from .env programmatically; never echo it.)

### Step 7 - Atlas DB user password rotation (cloud.mongodb.com, owner account)
Database Access -> edit the DB user used by MONGO_URI -> change password. Then update
MONGO_URI with the new password in BOTH Render env vars and local .env. Sanity check:
re-run the rotation script - it should print "alreadyHashed=3" (proves new URI works,
nothing plaintext).

### Step 8 - Gmail app password rotation
myaccount.google.com -> Security -> 2-Step Verification -> App passwords -> revoke the
existing entry for the sender account (EMAIL_USER in .env) -> create a new 16-char one.
Update EMAIL_APP_PASSWORD in Render env + local .env. Sanity: POST /api/email/send
returns "provider":"gmail".

### Step 9 - Close-out
Report final checklist: remote hash, detector result, rotation summary line, both login
test results, bridge health, Atlas sanity, email test. No further commits.

## 4. Exposure ledger (what stays at risk until each step completes)

| Exposure | Fixed by |
|---|---|
| Production DB reachable with leaked Atlas URI credential | Step 7 |
| Live demo super_admin logs in with public plaintext password (admin123) | Step 5 + 6 |
| Render runs old backend (no rate limit, no RBAC, open SSE, JWT fallback secret, wildcard CORS) | Steps 2-3 (+ JWT_SECRET in 3) |
| Bridge key mismatch: mobile already sends the NEW key; Render still expects OLD | Step 3 |
| Burned Gmail app password can send mail as the YTO sender address | Step 8 |

## 5. Key paths

    Repo:        C:\Users\ADMIN\React_Projects\YTO Latest
    Server dir:  C:\Users\ADMIN\React_Projects\YTO Latest\my-react-app\server
    Mobile env:  C:\Users\ADMIN\AndroidStudioProjects\YTO_Express_App\yto_express_backend\.env (bridge key already synced)
    Detector:    curl.exe -s -o NUL -w "%{http_code}" https://yto-express.onrender.com/api/customers
    New demo pw: server/.env -> DEMO_ADMIN_PASSWORD_SUPERADMIN / _STAFF / _HUB