#!/usr/bin/env node
/**
 * Audit Sync: compare Supabase auth.users vs Google Sheet Users tab.
 * Report-only — no mutations. Output JSON + console summary.
 *
 * Env vars required:
 *   SUPABASE_URL            https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE   service_role key (admin, NOT anon)
 *   GAS_URL                 deployed Apps Script web-app URL
 *   SYNC_TOKEN              shared secret (must match Script Property)
 *
 * Usage:
 *   node backend/audit-sync.js
 *   node backend/audit-sync.js --out audit.json
 *
 * Output:
 *   - audit-<timestamp>.json (or path from --out)
 *   - stdout summary
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE', 'GAS_URL', 'SYNC_TOKEN'];

function die(msg, code = 1) {
  console.error('ERROR: ' + msg);
  process.exit(code);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      out.outFile = args[++i];
    }
  }
  if (!out.outFile) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    out.outFile = path.join(process.cwd(), `audit-${ts}.json`);
  }
  return out;
}

async function fetchSupabaseUsers(url, key) {
  // Supabase Admin API: GET /auth/v1/admin/users
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.users || [];
  return list.map(u => ({
    id: u.id,
    email: (u.email || '').toLowerCase(),
    created_at: u.created_at,
  }));
}

async function fetchSheetUsers(gasUrl, token) {
  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list-users', token }),
  });
  if (!res.ok) {
    throw new Error(`GAS ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.status !== 'success') {
    throw new Error(`GAS error: ${body.message || 'unknown'}`);
  }
  return body.users.map(u => ({ ...u, email: (u.email || '').toLowerCase() }));
}

function diff(supabaseUsers, sheetUsers) {
  const supEmails = new Set(supabaseUsers.map(u => u.email).filter(Boolean));
  const sheetEmails = new Set(sheetUsers.map(u => u.email).filter(Boolean));

  const missingInSheet = supabaseUsers.filter(u => u.email && !sheetEmails.has(u.email));
  const missingInSupabase = sheetUsers.filter(u => u.email && !supEmails.has(u.email));
  const inBoth = supabaseUsers.filter(u => u.email && sheetEmails.has(u.email));

  return { missingInSheet, missingInSupabase, inBoth };
}

async function main() {
  for (const k of REQUIRED_ENV) {
    if (!process.env[k]) die(`Missing env var: ${k}`);
  }
  const { outFile } = parseArgs();

  console.log('Fetching Supabase users...');
  const supabaseUsers = await fetchSupabaseUsers(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );
  console.log(`  ${supabaseUsers.length} Supabase users`);

  console.log('Fetching Sheet users...');
  const sheetUsers = await fetchSheetUsers(process.env.GAS_URL, process.env.SYNC_TOKEN);
  console.log(`  ${sheetUsers.length} Sheet users`);

  const report = diff(supabaseUsers, sheetUsers);

  const summary = {
    generated_at: new Date().toISOString(),
    counts: {
      supabase: supabaseUsers.length,
      sheet: sheetUsers.length,
      in_both: report.inBoth.length,
      missing_in_sheet: report.missingInSheet.length,
      missing_in_supabase: report.missingInSupabase.length,
    },
    missing_in_sheet: report.missingInSheet,
    missing_in_supabase: report.missingInSupabase,
  };

  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

  console.log('');
  console.log('=== AUDIT REPORT ===');
  console.log(`Supabase users:        ${summary.counts.supabase}`);
  console.log(`Sheet users:           ${summary.counts.sheet}`);
  console.log(`In both (aligned):     ${summary.counts.in_both}`);
  console.log(`Missing in Sheet:      ${summary.counts.missing_in_sheet}`);
  console.log(`Missing in Supabase:   ${summary.counts.missing_in_supabase}`);
  console.log('');
  if (summary.counts.missing_in_sheet > 0) {
    console.log('Users in Supabase but NOT in Sheet:');
    report.missingInSheet.forEach(u => console.log(`  - ${u.email}`));
  }
  if (summary.counts.missing_in_supabase > 0) {
    console.log('Users in Sheet but NOT in Supabase:');
    report.missingInSupabase.forEach(u => console.log(`  - ${u.email}`));
  }
  console.log('');
  console.log(`Report saved: ${outFile}`);
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(2);
});
