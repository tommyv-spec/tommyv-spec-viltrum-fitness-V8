// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - Shopify Webhook Handler
// Supabase Edge Function
//
// Receives Shopify "order paid" webhook, then:
// 1. Verifies HMAC signature
// 2. Extracts customer email + product → plan mapping
// 3. Creates Supabase Auth user if new (with temp password)
// 4. Calls Google Apps Script to add plan to user in Sheets
// 5. GAS sends welcome email with credentials for new users
//
// SETUP:
// 1. Deploy: supabase functions deploy shopify-webhook
// 2. Set secrets:
//    supabase secrets set SHOPIFY_WEBHOOK_SECRET=your_shopify_secret
//    supabase secrets set GOOGLE_SCRIPT_URL=your_gas_url
//    supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
// 3. In Shopify Admin → Settings → Notifications → Webhooks:
//    Add webhook: Event "Order payment", URL = your edge function URL
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// ── Config from environment ──
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") || "";
const GOOGLE_SCRIPT_URL = Deno.env.get("GOOGLE_SCRIPT_URL") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") || "";
// V9: addPlanToUser is now sync-token gated. Must match the SYNC_TOKEN Script
// Property on the Apps Script side, or purchases will not grant plans.
const SYNC_TOKEN = Deno.env.get("SYNC_TOKEN") || "";

// ── Shopify Product → Plan Name mapping ──
// Keys: Shopify product title (lowercase) or product ID
// Values: Plan name exactly as it appears in the Plans sheet
// All Shopify products → "Pending" placeholder.
// Real plan is assigned manually by the coach AFTER the customer fills the
// questionnaire (via Admin Sync menu -> Lead / Questionari -> Converti).
// Pending is not a row in the Plans sheet, so no workouts show until the coach
// promotes the user to a real plan.
const PENDING_PLAN = "Pending";
const PRODUCT_PLAN_MAP: Record<string, string> = {
  // By product title (lowercase) — keys MUST be lowercase
  "da zero a hybrid":  PENDING_PLAN,
  "viltrum 21k":       PENDING_PLAN,
  "hyrox ready":       PENDING_PLAN,
  "periodo di prova":  PENDING_PLAN,
};


// ═══════════════════════════════════════════════════════════════════════════
// HMAC VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

async function verifyShopifyHmac(body: string, hmacHeader: string): Promise<boolean> {
  if (!SHOPIFY_WEBHOOK_SECRET || !hmacHeader) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SHOPIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return computedHmac === hmacHeader;
}


// ═══════════════════════════════════════════════════════════════════════════
// GENERATE TEMP PASSWORD
// ═══════════════════════════════════════════════════════════════════════════

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (const byte of array) {
    password += chars[byte % chars.length];
  }
  return password;
}


// ═══════════════════════════════════════════════════════════════════════════
// RESOLVE PLAN NAME FROM SHOPIFY ORDER
// ═══════════════════════════════════════════════════════════════════════════

function resolvePlanName(order: any): string | null {
  if (!order.line_items || order.line_items.length === 0) return null;

  for (const item of order.line_items) {
    // Try by product title
    const titleKey = (item.title || "").toLowerCase().trim();
    if (PRODUCT_PLAN_MAP[titleKey]) return PRODUCT_PLAN_MAP[titleKey];

    // Try by product ID
    const idKey = String(item.product_id);
    if (PRODUCT_PLAN_MAP[idKey]) return PRODUCT_PLAN_MAP[idKey];

    // Try by variant title
    const variantKey = (item.variant_title || "").toLowerCase().trim();
    if (PRODUCT_PLAN_MAP[variantKey]) return PRODUCT_PLAN_MAP[variantKey];

    // Try by SKU
    const skuKey = (item.sku || "").toLowerCase().trim();
    if (PRODUCT_PLAN_MAP[skuKey]) return PRODUCT_PLAN_MAP[skuKey];
  }

  // Fallback: use first product title as plan name directly
  return order.line_items[0].title || null;
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

// Background worker: heavy lifting (Supabase user, password reset, GAS call).
// Runs after Shopify gets its 200 OK, kept alive by EdgeRuntime.waitUntil.
async function processOrder(order: any): Promise<void> {
  const email = (order.customer?.email || order.email || "").trim().toLowerCase();
  const firstName = order.customer?.first_name || "";
  const lastName = order.customer?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || email.split("@")[0];

  if (!email) { console.error("❌ No email in order"); return; }

  const planName = resolvePlanName(order);
  if (!planName) { console.error("❌ Could not resolve plan name from order"); return; }

  console.log(`📦 Order received: ${email} → ${planName}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let isNewUser = false;
  const tempPassword = generateTempPassword();

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u: any) => u.email?.toLowerCase() === email
  );

  if (!existingUser) {
    isNewUser = true;
    const { error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, username: firstName || email.split("@")[0], source: "shopify" },
    });
    if (createError) { console.error("❌ Failed to create Supabase user:", createError.message); return; }
    console.log(`✅ Created Supabase user: ${email}`);
  } else {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: tempPassword,
    });
    if (updateErr) console.error(`⚠️ Failed to reset password for ${email}:`, updateErr.message);
    else console.log(`🔑 Reset password for existing Supabase user: ${email}`);
  }

  const durationMonths = 4;
  try {
    const gasResponse = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addPlanToUser",
        token: SYNC_TOKEN,
        email,
        planName,
        fullName,
        isNewUser,
        tempPassword,
        durationMonths,
        source: "shopify",
        orderId: order.id?.toString() || "",
        orderTotal: order.total_price || "",
      }),
      redirect: "follow",
    });
    const gasResult = await gasResponse.json();
    console.log(`✅ GAS response:`, gasResult);
  } catch (gasError) {
    console.error("❌ GAS call failed:", gasError);
  }
}

serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  // ── Verify Shopify HMAC (must be sync — Shopify trusts our 200 response)
  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256") || "";
  if (SHOPIFY_WEBHOOK_SECRET) {
    const valid = await verifyShopifyHmac(body, hmacHeader);
    if (!valid) {
      console.error("❌ Invalid HMAC signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  let order: any;
  try {
    order = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Root-cause fix for duplicate webhook deliveries:
  //   Shopify times out webhooks at ~5s and retries on timeout.
  //   The heavy work (listUsers, createUser, fetch GAS) takes ~4-6s.
  //   Solution: ACK Shopify in <100ms; process in background via waitUntil.
  // @ts-ignore - EdgeRuntime is a Supabase Deno global
  EdgeRuntime.waitUntil(processOrder(order));

  return new Response(JSON.stringify({ received: true, orderId: order.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

