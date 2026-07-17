# V9 Auth Fix — Deploy Runbook

Closes the anonymous-read/write holes in the Apps Script backend. Written 2026-07-17.

**Nothing is live yet.** Production still serves Apps Script `@32` (the vulnerable version).
The V9 code is pushed to Apps Script HEAD, and the client lives on the **`v9-auth` branch**.

## ⚠️ Read this before running deploy.ps1

The V9 client is on branch `v9-auth`, **not** on `main`. This is deliberate.

`deploy.ps1` runs `git add -A` and deploys whatever is in the working tree. The V9 client
talks only to the V9 backend, so deploying it while production serves `@32` breaks the whole
app. Keep V9 on its branch until Step 1 is done and Step 2 has promoted the backend.

This already bit us once: `v8.2.36` was deployed mid-session and swept up a half-finished V9
change to `pages/endurance.html`. It shipped an authenticated call to the old backend, which
still required an `email` it no longer received — endurance cloud progress sync failed
silently for every user until `v8.2.37` reverted it. Local progress was unaffected and no data
was lost, but nothing warned: the call is wrapped in a `.catch()` that only logs.

**Only ever deploy `main`. Merge `v9-auth` into it as part of Step 4, not before.**

---

## What the fix is, in one line

`doPost` verifies the caller's Supabase token and **overwrites `data.email` with the verified address**, so a caller can no longer name whose data they want. Endpoints live in three tables — public / sync-token / user-token — and anything not in a table is denied.

---

## State

| Item | Status |
|---|---|
| Backend V9 code | ✅ written, pushed to Apps Script **HEAD** (production `@32` untouched) |
| Staging deployment | ✅ `AKfycbwuh2hrho__RELvXqvSfBYmF61zXwBL76n2W5NNNEf3jZvveCU8B1k-sln9AtMHhFw6Rg` @33 |
| `SYNC_TOKEN` — Supabase edge secret | ✅ set to a NEW value (fingerprint `tNyJ…YO`, 48 chars) |
| `SYNC_TOKEN` — value on disk | ✅ `backend/.env.sync` (gitignored, verified) |
| `SYNC_TOKEN` — **Script Property** | ⚠️ **exists, but holds a DIFFERENT value — see Step 1** |
| `SUPABASE_ANON_KEY` Script Property | ✅ not needed — hardcoded (it's public by design) |
| Client code migrated (11 call sites) | ✅ written, **not deployed** |
| Regression test | ✅ `node backend/tests/test-auth-routing.cjs` → 28/28 |
| Supabase rejects forged JWTs | ✅ verified live (403 `bad_jwt`, signature enforced) |
| CORS (`text/plain` POST, no preflight) | ✅ verified live — `access-control-allow-origin: *` |
| **IDOR closed — real tokens vs staging** | ✅ verified: B with a valid token could not read or write A |
| Revenue bypass closed | ✅ verified: user token → `addPlanToUser` → `Unauthorized` |
| Browser page-load / module wiring | ❌ not tested (see Step 3) |
| Production promotion | ❌ not done |

### Evidence for the security claims

Run against the staging deployment with two real throwaway Supabase sessions:

| Test | Result |
|---|---|
| bare `GET` (the old full dump) | `{"status":"error","code":"gone"}` — no data |
| `GET ?action=getUserData&email=…` (old IDOR) | `{"status":"error","code":"gone"}` — no data |
| `POST getUserData` no token | `unauthorized: Missing session token` |
| `POST getUserData` forged token | `unauthorized: Invalid or expired session` |
| A reads own row with valid token | `success`, returns A's email ✅ (app works) |
| **B (valid token) requests `email=A`** | **`User not found` — B could not read A** |
| **B (valid token) writes `email=A`** | **write landed in B's own row; A unaffected** |
| B (valid token) calls `addPlanToUser` | `Unauthorized` |
| unlisted action | `Unknown action` |

### Test leftovers to delete

Two throwaway Supabase auth users were created and **already deleted automatically**. These sheet
rows remain and should be removed by hand (both are inert — no plan means no access):

- **`Users` sheet** → row for `v9-authtest-a-mro5l7y9@example.com`
- **`UserWeights` sheet** → row for `v9-authtest-b-mro5l7y9@example.com`

---

## Step 1 — Reconcile SYNC_TOKEN (only you can do this) ← **BLOCKING**

### What we know for certain

`SYNC_TOKEN` **already exists** as a Script Property. Proven empirically: calling `addPlanToUser`
against staging returned `"Unauthorized"`, and `_checkSyncToken` only reaches that branch when the
property is set (an unset property returns `"SYNC_TOKEN not configured in Script Properties"`).

Its value is **unknown to us** and cannot be read: `clasp run` fails because the script's GCP project
doesn't match clasp's OAuth client, and Script Properties aren't exposed by any API clasp can reach.

**A new value was already written to the Supabase edge secret `SYNC_TOKEN`** (fingerprint `tNyJ…YO`,
48 chars, full value in `backend/.env.sync`). The two therefore **do not match right now.**

That mismatch is harmless today — production `@32` doesn't check the token at all. It becomes a
**revenue outage the moment v33 is promoted**: the Shopify webhook would be rejected and purchases
would silently stop granting plans.

### Pick one, before Step 2

**Option A — adopt the new token (recommended; rotates the secret, which is good hygiene after an audit)**

1. Apps Script editor (`clasp open-script` from `backend/apps-script/`, or script.google.com).
2. **Project Settings** → **Script Properties** → edit `SYNC_TOKEN`.
3. Paste the value from the `SYNC_TOKEN=` line in `backend/.env.sync`. Save.
4. If you run `audit-sync.js` / `admin-readd-user.js` from any machine, update their env to match.

**Option B — keep the existing token**

1. Read the current `SYNC_TOKEN` from Script Properties.
2. `supabase secrets set SYNC_TOKEN=<that existing value>` (overwrites what we set).
3. Nothing else changes; your audit tooling keeps working untouched.

### Verify either way

In the editor run `v9AuthDiagnostics` → expect `syncTokenConfigured: true`, `syncTokenLength: 48`
(Option A) or your existing length (Option B).
Run `v9CheckSupabaseReachable` → expect `healthy: true`. Supabase answers **403** for a bad token,
not 401 — verified against the live project. Do not "fix" that assertion to 401.

Final check that they match, after promotion, is Step 3's purchase test.

---

## Step 2 — Promote the backend

```bash
cd backend/apps-script
clasp deploy --deploymentId AKfycbziZcFyYVVoK4w8jvHEnd0Fi6cD9ZaIGnBwDQc0Dhf1wx7tZ1uWgW8e74O5jR2c8YodGg -d "v33: V9 auth - Supabase JWT on all user endpoints"
```

That deployment ID is the live URL in `js/config.js`. Promoting it is the moment the holes close — **and the moment every un-updated client breaks** (old cached JS calls GET endpoints that no longer exist).

Rollback: re-deploy the same ID pinned to version 32.

---

## Step 3 — Test before trusting it

The HTTP contract, the Supabase round-trip, CORS, and IDOR closure are all **verified against real
deployed code** (see the evidence table above). What is **not** verified is the browser page itself:
module load order, `window.ViltrumAPI` being present when `index.html` and `offline-preloader.js`
reach for it, and the service-worker precache picking up the new `js/api.js`.

**Recommended: test against staging before promoting anything.** Point the client at the staging
deployment and run the app locally:

1. In `js/config.js`, temporarily set `GOOGLE_SCRIPT_URL` to the staging URL
   (`.../AKfycbwuh2hrho__RELvXqvSfBYmF61zXwBL76n2W5NNNEf3jZvveCU8B1k-sln9AtMHhFw6Rg/exec`).
2. Serve the folder (`npx serve .`) and log in with a real account.
3. Check: dashboard loads, a workout starts and completes, progress survives a reload,
   and the console shows no CORS errors and no `ViltrumAPI is undefined`.
4. **Revert `config.js`** before deploying.

If that passes, Steps 2 and 4 are low-risk. If it fails, nothing in production was touched.

### After promotion

Make one real (or test-mode) Shopify purchase and confirm the plan is granted. That is the only
end-to-end proof that the Step 1 token reconciliation is correct.

## Step 3b — Delete the staging deployment when done

It serves the same spreadsheet and is anonymous-accessible (secured by V9, but it is extra surface):

```bash
cd backend/apps-script
clasp undeploy AKfycbwuh2hrho__RELvXqvSfBYmF61zXwBL76n2W5NNNEf3jZvveCU8B1k-sln9AtMHhFw6Rg
```

---

## Step 4 — Deploy the client

```powershell
.\deploy.ps1 -Message "v9: authenticated backend"
```

Bumps `sw.js`, commits, pushes, runs `wrangler deploy`. (A git push alone does **not** publish; wrangler does.)

### The cutover window

`sw.js` deliberately does **not** `skipWaiting()` — users get an "Aggiorna" banner and stay on old code until they tap it. Between step 2 and a user tapping that banner, **their app is broken**, because old JS talks to endpoints V9 removed.

Recommendation: for this one release, call `self.skipWaiting()` in the SW `install` handler so clients update without asking. Waiting for consent to leave a broken state is the wrong trade here. Open pages still need a reload either way.

---

## Step 5 — Check for evidence of exploitation

`clasp logs` needs a GCP project, so this is manual: Apps Script editor → **Executions**. Look for `doGet` executions that don't correspond to app traffic.

This is what separates "we fixed a hole" from "we had a breach". If real customer data was pulled, GDPR Art. 33 gives you **72 hours from awareness** to assess notifiability. The exposed fields were: every customer's email, full name, subscription expiry, and nutrition PDF link.

Also audit Drive sharing on the `nutrition_pdf_url` files — if they're "anyone with the link", those links were in the anonymous dump, and the PDFs are health data.

---

## Note on stale client caches

Pre-V9 clients cached the **entire** backend response — every customer's email, name and PDF link — into each user's `localStorage`. Closing the endpoint does not remove those copies.

`js/api.js` runs a one-shot purge (flag `viltrum_v9_legacy_purged`) on import to wipe them. Leave it in place until you're confident every install has loaded once.
