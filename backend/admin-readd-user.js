#!/usr/bin/env node
/**
 * Admin Re-Add User: re-create or update a row in the Google Sheet Users tab.
 * Use after an involuntary delete, or to align a Supabase user with the Sheet.
 *
 * Env vars required:
 *   GAS_URL                 deployed Apps Script web-app URL
 *   SYNC_TOKEN              shared secret (must match Script Property)
 *
 * Optional (used to auto-fill name from Supabase if --name not provided):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE
 *
 * Usage:
 *   node backend/admin-readd-user.js <email>
 *   node backend/admin-readd-user.js <email> --name "Mario Rossi"
 *   node backend/admin-readd-user.js <email> --plan "Prep Program" --scadenza 2026-12-31
 *
 * Defaults:
 *   plan      "Trial Plan"
 *   scadenza  today + 7 days
 */

function die(msg, code = 1) {
  console.error('ERROR: ' + msg);
  process.exit(code);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) die('Usage: node admin-readd-user.js <email> [--name "..."] [--plan "..."] [--scadenza YYYY-MM-DD]');
  const out = { email: args[0] };
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    const val = args[++i];
    if (flag === '--name') out.name = val;
    else if (flag === '--plan') out.plan = val;
    else if (flag === '--scadenza') out.scadenza = val;
    else die(`Unknown flag: ${flag}`);
  }
  if (!out.email || !out.email.includes('@')) die(`Invalid email: ${out.email}`);
  return out;
}

async function fetchSupabaseUserByEmail(url, key, email) {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.users || [];
  return list.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function main() {
  if (!process.env.GAS_URL) die('Missing env var: GAS_URL');
  if (!process.env.SYNC_TOKEN) die('Missing env var: SYNC_TOKEN');

  const args = parseArgs();
  let name = args.name || '';

  if (!name && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE) {
    console.log('Looking up name in Supabase...');
    const u = await fetchSupabaseUserByEmail(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE,
      args.email
    );
    if (u) {
      name = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
      console.log(`  found: ${name || '(no name in metadata)'}`);
    } else {
      console.log('  not found in Supabase');
    }
  }

  const payload = {
    action: 're-add-user',
    token: process.env.SYNC_TOKEN,
    email: args.email,
    name: name,
    plan: args.plan || 'Trial Plan',
    scadenza: args.scadenza || null,
  };

  console.log(`Re-adding user: ${args.email}`);
  const res = await fetch(process.env.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();

  if (body.status === 'success') {
    console.log(`OK [${body.mode}]: ${body.email}`);
  } else {
    die(`GAS response: ${body.message || JSON.stringify(body)}`);
  }
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(2);
});
