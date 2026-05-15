// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - Sync User Delete (Supabase -> Google Sheet)
// Supabase Edge Function
//
// Triggered by Supabase Database Webhook on auth.users DELETE.
// Hard-deletes the corresponding row from the Google Sheet Users tab.
//
// SETUP:
// 1. Deploy:
//      supabase functions deploy sync-user-delete --no-verify-jwt
// 2. Set secrets:
//      supabase secrets set GAS_URL=<your_apps_script_webapp_url>
//      supabase secrets set SYNC_TOKEN=<random_secret>
//      (SYNC_TOKEN must match Script Property in Apps Script)
// 3. Configure Database Webhook (Supabase Dashboard):
//      Database -> Webhooks -> Create
//      Name:    sync-user-delete
//      Table:   auth.users
//      Events:  Delete
//      Type:    Supabase Edge Functions
//      Edge Function: sync-user-delete
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const GAS_URL = Deno.env.get("GAS_URL") || "";
const SYNC_TOKEN = Deno.env.get("SYNC_TOKEN") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!GAS_URL || !SYNC_TOKEN) {
    return json({ error: "missing GAS_URL or SYNC_TOKEN env vars" }, 500);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Supabase Database Webhook payload shape:
  //   { type: "DELETE", table: "users", schema: "auth", old_record: {...} }
  if (payload.type !== "DELETE") {
    return json({ skipped: true, reason: `event=${payload.type}` });
  }

  const oldRecord = payload.old_record || payload.record;
  const email = (oldRecord?.email || "").toString().toLowerCase().trim();
  if (!email) return json({ error: "no email in payload" }, 400);

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete-user",
        token: SYNC_TOKEN,
        email,
      }),
    });
    const body = await res.json();
    return json({ supabase_event: "DELETE", email, gas: body });
  } catch (err) {
    return json({ error: "gas call failed", detail: String(err) }, 502);
  }
});
