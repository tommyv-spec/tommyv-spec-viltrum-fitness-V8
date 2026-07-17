# V9 Auth — SHIPPED 2026-07-17

The Apps Script backend authenticated every user endpoint with a Supabase JWT. **Live in
production**: Apps Script deployment `@34`, client `v8.2.38`.

---

## What was wrong

The web app is deployed `ANYONE_ANONYMOUS` and took the caller's identity from an `email`
query parameter. The endpoint URL is not a secret — it ships to every browser in
`js/config.js`. So the login screen protected nothing.

| Hole | Was |
|---|---|
| **C1** full customer dump | bare `GET <url>` returned every customer's email, full name, expiry and nutrition PDF link |
| **C2** IDOR on every read | `?action=getUserData&email=<anyone>` — only validation was `includes('@')` |
| **C3** unauthenticated writes | `saveWeights` / `saveLastWorkout` over GET; **`addPlanToUser` = free subscriptions** |
| **C4** health data | `submitQuestionnaire` public, unrate-limited, stores GDPR Art. 9 data |
| + | `list-email-log` ungated (customer emails); `bustCache` ungated (quota DoS) |
| + | dead pre-Supabase `login()` put **credentials in a URL query string** |
| + | sheet strings → `innerHTML` (stored XSS → session token in localStorage) |

## The fix

`doPost` verifies the caller's Supabase token and **overwrites `data.email` with the verified
address** before dispatch. A caller can no longer name whose data they want.

Endpoints live in one of three tables — `PUBLIC_ACTIONS` / `SYNC_ACTIONS` / `USER_ACTIONS`.
**Anything not in a table is denied.** Adding an endpoint without choosing its auth is now
impossible.

Transport is POST + `Content-Type: text/plain` — a CORS "simple request". Apps Script cannot
answer a preflight (there is no `doOptions`), so an `Authorization` header is impossible
cross-origin. The token rides in the body, which also keeps it out of URLs and execution logs.
**Do not "improve" this to a header or a `?token=` param.**

## Verified in production

8/8 holes confirmed closed against the live endpoint, and 19/19 in a real Chromium browser
with a real Supabase session:

- user B holding a **valid** token asked for user A's row → `User not found`
- user B wrote with `email=A` → the write landed in **B's own row**
- user B called `addPlanToUser` → `Unauthorized`
- bare `GET` → `{"code":"gone"}`, no data
- forged JWT → rejected (Supabase answers **403 `bad_jwt`**, not 401 — do not assert 401)

Regression suite (71 checks): `node backend/tests/test-auth-routing.cjs` (32),
`test-client-api.mjs` (28), `test-wiring.mjs` (11). Browser: `test-browser-e2e.cjs` (19,
needs `NODE_PATH` set to `node_modules` and `npm i --no-save playwright`).

---

## ⚠️ Outstanding — please do these

### 1. Check for evidence of exploitation

`clasp logs` needs a GCP project, so this is manual: Apps Script editor → **Executions**. Look
for `doGet` calls that don't match app traffic.

This decides whether this was a close call or a breach. **GDPR Art. 33 gives 72 hours from
awareness.** Exposed fields: every customer's email, full name, subscription expiry, nutrition
PDF link.

### 2. Audit Drive sharing on the nutrition PDFs

If `nutrition_pdf_url` files are "anyone with the link", those links were in the anonymous
dump — and the PDFs are health data (Art. 9).

### 3. Revert the service-worker `skipWaiting()`

`sw.js` install calls `self.skipWaiting()` as a **one-off** for this rollout, because pre-V9
clients could not talk to the V9 backend at all and waiting for consent would have stranded
them. Put the original comment back and drop the call so users regain control of updates. The
`SKIP_WAITING` message handler is untouched and still drives the "Aggiorna" banner.

### 4. Delete the test rows (all inert — no plan means no access)

- `Users` sheet: `v9-authtest-a-mro5l7y9@example.com`, `v9-browser-mro69el7@example.com`,
  `v9-browser-mro6ajxm@example.com`, `v9-browser-mro8135e@example.com`
- `UserWeights` sheet: `v9-authtest-b-mro5l7y9@example.com`
- `UserProgress` sheet: any row named `HotfixProbe`

Throwaway Supabase auth users were deleted automatically.

### 5. Consider rate-limiting `submitQuestionnaire`

Still public by necessity (prospects have no account) and it stores health data. Consider a
CAPTCHA, a retention period, and restricting the `Leads` sheet ACL.

---

## Things worth knowing

**`SYNC_TOKEN` was the literal string `openssl rand -hex 32`** — the command was pasted instead
of run. It now holds a real 256-bit hex token (`backend/.env.sync`, gitignored). It must match
in three places: the Script Property, the Supabase edge secret (`supabase secrets set
SYNC_TOKEN=...`), and `backend/.env.sync` for `audit-sync.js`. **Rotating means updating all
three or Shopify purchases stop granting plans.** It cannot be set from `clasp` — Script
Properties have no API clasp can reach and `clasp run` needs a GCP OAuth client this project
doesn't have. That field is human-only.

**The anon key is hardcoded in `Codice.js`** with a Script Property override. It's public by
design (already in `js/config.js`), so this needs no setup. Keep it in sync with `config.js` —
`test-wiring.mjs` asserts they match.

**Never cache an error response per user.** `_cacheIfSuccess` exists because caching
`"User not found"` for 5 minutes left new signups staring at an empty dashboard long after
their row existed. Pre-V9 bug, found via a flaky e2e run.

**Stale caches on user devices.** Pre-V9 clients cached the *entire* backend response — every
customer's email and name — into each user's `localStorage`. `js/api.js` runs a one-shot purge
(flag `viltrum_v9_legacy_purged`) on import. Leave it until every install has loaded once.

## Two ways this bit us — worth remembering

**`deploy.ps1` runs `git add -A`.** It ran mid-session and swept up a half-finished V9 change
to `endurance.html`, shipping an authenticated call to the old backend: endurance cloud sync
failed silently for every user (`.catch` only warns) until `v8.2.37` reverted it. If work is in
progress, it is on a branch or it is not in the tree.

**Grep for the capability, not one syntax for it.** The first sweep searched for the literal
`?action=` and so missed `js/workout-history.js`, which built the same URLs with
`searchParams.append` — four live IDOR endpoints that survived. `test-wiring.mjs` now matches
on anything touching `GOOGLE_SCRIPT_URL` outside `js/api.js`.
