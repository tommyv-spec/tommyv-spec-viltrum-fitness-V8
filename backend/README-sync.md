# Supabase ↔ Google Sheet Sync

Tools to keep the Supabase `auth.users` table aligned with the Google Sheet `Users` tab.

## Components

| File | Purpose |
|------|---------|
| `google-apps-script-v7.gs` | 3 new doPost actions: `list-users`, `re-add-user`, `delete-user` (token-gated) |
| `audit-sync.js` | Report-only diff: who's in Supabase but missing from Sheet, and vice versa |
| `admin-readd-user.js` | CLI to re-add or update a row in the Sheet (idempotent) |
| `supabase-functions/sync-user-delete/index.ts` | Edge Function: deletes Sheet row on Supabase user delete |

## One-time setup

### 1. Google Apps Script
1. Open the Apps Script editor for the bound Google Sheet.
2. Confirm the 3 new functions exist: `syncListUsers`, `syncReAddUser`, `syncDeleteUser` (plus `_checkSyncToken`).
3. **Set the shared secret**: Project Settings → Script Properties → Add property:
   - Name: `SYNC_TOKEN`
   - Value: a random string (e.g., `openssl rand -hex 32`)
4. Re-deploy the web app (Deploy → Manage deployments → Edit → New version → Deploy).
5. Note the web-app URL — used as `GAS_URL` in env vars below.

### 2. Local env vars

Create `backend/.env.sync` (gitignored — see `.gitignore`):

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE=<service_role_key_from_supabase_dashboard>
GAS_URL=https://script.google.com/macros/s/.../exec
SYNC_TOKEN=<same_value_as_script_property>
```

Load before running scripts:
```bash
set -a; source backend/.env.sync; set +a
```

### 3. Supabase Edge Function (auto-sync on delete)
```bash
cd backend/supabase-functions
supabase functions deploy sync-user-delete --no-verify-jwt
supabase secrets set GAS_URL="<gas_url>"
supabase secrets set SYNC_TOKEN="<same_token>"
```

In the Supabase dashboard: **Database → Webhooks → Create**
- Name: `sync-user-delete`
- Table: `auth.users`
- Events: `Delete`
- Type: Supabase Edge Functions
- Function: `sync-user-delete`

## Operations

### Run an audit
```bash
node backend/audit-sync.js
# or
node backend/audit-sync.js --out audit-2026-05.json
```

Output: console summary + JSON report. **No mutations.**

### Re-add a user (after involuntary delete)
```bash
node backend/admin-readd-user.js mario@example.com
node backend/admin-readd-user.js mario@example.com --name "Mario Rossi" --plan "Prep Program" --scadenza 2026-12-31
```

If `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` are set and `--name` is omitted, the script tries to pull the name from the Supabase user metadata.

Defaults if not specified:
- `plan` = `"Trial Plan"`
- `scadenza` = today + 7 days

The action is **idempotent**: existing row gets updated, missing row gets inserted.

### Auto-sync on delete
Triggers automatically once the Database Webhook is configured. To verify:
1. Delete a test user in Supabase dashboard (`auth.users`).
2. Check Apps Script `Executions` log — should show a `syncDeleteUser` call.
3. Confirm the row is gone from the Sheet.

## Data model

Sheet `Users` columns (0-indexed):
- col 0: name
- col 1: email (lowercase)
- col 2-3: (unused / placeholder)
- col 4: scadenza (Date)
- col 5: plan name (string, must match a row in `Plans` sheet)

`syncReAddUser` writes columns 0, 4, 5 (name, scadenza, plan).
`syncDeleteUser` removes the entire row by email match (hard delete).

## Security notes

- `SUPABASE_SERVICE_ROLE` bypasses RLS — keep it server-side only, never commit.
- `SYNC_TOKEN` is a shared secret between the Edge Function / CLI tools and Apps Script. Rotate by updating both the Script Property and the Supabase secret.
- The 3 sync actions return 401 if the token is missing or wrong.
- The audit script is read-only.
