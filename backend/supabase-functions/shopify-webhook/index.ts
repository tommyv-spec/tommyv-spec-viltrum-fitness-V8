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

// ── Shopify Product → Plan Name mapping ──
// Keys: Shopify product title (lowercase) or product ID
// Values: Plan name exactly as it appears in the Plans sheet
const PRODUCT_PLAN_MAP: Record<string, string> = {
  // By product title (lowercase) — keys MUST be lowercase
  // Placeholder: all current Shopify products → Free Trial; coach personalizes via questionnaire + Admin UI
  "da zero a hybrid":  "Free Trial",
  "viltrum 21k":       "Free Trial",
  "hyrox ready":       "Free Trial",
  "periodo di prova":  "Free Trial",
  // Can also map by product ID:
  // "12345678": "Free Trial",
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

serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  // ── Verify Shopify HMAC ──
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

  // ── Extract customer info ──
  const email = (order.customer?.email || order.email || "").trim().toLowerCase();
  const firstName = order.customer?.first_name || "";
  const lastName = order.customer?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || email.split("@")[0];

  if (!email) {
    console.error("❌ No email in order");
    return new Response(JSON.stringify({ error: "No customer email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Resolve plan name ──
  const planName = resolvePlanName(order);
  if (!planName) {
    console.error("❌ Could not resolve plan name from order");
    return new Response(JSON.stringify({ error: "Unknown product/plan" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`📦 Order received: ${email} → ${planName}`);

  // ── Check/Create Supabase Auth user ──
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let isNewUser = false;
  let tempPassword = "";

  // Check if user exists in Supabase Auth
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

  const userExists = existingUsers?.users?.some(
    (u: any) => u.email?.toLowerCase() === email
  );

  if (!userExists) {
    // Create new Supabase Auth user
    isNewUser = true;
    tempPassword = generateTempPassword();

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName,
        username: firstName || email.split("@")[0],
        source: "shopify",
      },
    });

    if (createError) {
      console.error("❌ Failed to create Supabase user:", createError.message);
      return new Response(
        JSON.stringify({ error: "Failed to create user", details: createError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Created Supabase user: ${email}`);
  } else {
    console.log(`ℹ️ User already exists in Supabase: ${email}`);
  }

  // ── Call Google Apps Script to add plan ──
  try {
    const gasResponse = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addPlanToUser",
        email: email,
        planName: planName,
        fullName: fullName,
        isNewUser: isNewUser,
        tempPassword: isNewUser ? tempPassword : undefined,
      }),
      // Follow redirects (GAS returns 302 → final JSON)
      redirect: "follow",
    });

    const gasResult = await gasResponse.json();
    console.log(`✅ GAS response:`, gasResult);

    return new Response(
      JSON.stringify({
        success: true,
        email: email,
        planName: planName,
        isNewUser: isNewUser,
        gasResult: gasResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (gasError) {
    console.error("❌ GAS call failed:", gasError);
    return new Response(
      JSON.stringify({
        error: "GAS call failed",
        details: String(gasError),
        // Still return success since Supabase user was created
        partialSuccess: true,
        email: email,
        planName: planName,
      }),
      { status: 207, headers: { "Content-Type": "application/json" } }
    );
  }
});
