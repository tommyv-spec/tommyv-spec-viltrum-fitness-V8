# Shopify → Viltrum Fitness Integration Setup

## Architecture

```
Shopify Order Paid
       ↓
  Webhook POST
       ↓
Supabase Edge Function (shopify-webhook)
       ├── Check/Create Supabase Auth user
       ├── Call GAS addPlanToUser
       └── GAS sends welcome email (new users only)
```

## Step 1: Update Google Apps Script

1. Open your Google Sheet → Extensions → Apps Script
2. Replace the code with `backend/google-apps-script-v7.gs`
3. Deploy → Manage deployments → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
4. Copy the deployment URL

## Step 2: Deploy Supabase Edge Function

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref nvdrvqamxoqezmfrnjcw

# Set secrets
supabase secrets set SHOPIFY_WEBHOOK_SECRET=your_shopify_webhook_secret
supabase secrets set GOOGLE_SCRIPT_URL=your_gas_deployment_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Deploy the function
cd backend/supabase-functions
supabase functions deploy shopify-webhook
```

Your Edge Function URL will be:
`https://nvdrvqamxoqezmfrnjcw.supabase.co/functions/v1/shopify-webhook`

## Step 3: Configure Shopify Webhook

1. Shopify Admin → Settings → Notifications → Webhooks
2. Click "Create webhook"
   - Event: **Order payment**
   - Format: JSON
   - URL: `https://nvdrvqamxoqezmfrnjcw.supabase.co/functions/v1/shopify-webhook`
3. Copy the **Webhook signing secret** → use it as `SHOPIFY_WEBHOOK_SECRET` in Step 2

## Step 4: Map Products to Plans

Edit the `PRODUCT_PLAN_MAP` in `shopify-webhook/index.ts`:

```typescript
const PRODUCT_PLAN_MAP: Record<string, string> = {
  "prep program": "Prep Program",        // Product title → Plan name
  "strength program": "Strength Program",
  "12345678": "Custom Plan",              // Product ID → Plan name
};
```

The plan name must match exactly what's in the **Plans** sheet.

If no mapping is found, it falls back to using the Shopify product title as the plan name.

## How It Works

### New Customer (never used Viltrum)
1. Buys "Prep Program" on Shopify
2. Edge Function creates Supabase Auth account with temp password
3. GAS creates row in Users sheet: `[name, email, "", "", "", "Prep Program"]`
4. GAS sends welcome email with login credentials
5. Customer opens app, logs in, sees "Prep Program"

### Existing Customer (already has account)
1. Buys "Strength Program" on Shopify
2. Edge Function sees user exists in Supabase Auth, skips creation
3. GAS adds "Strength Program" to existing row (next plan column)
4. No email sent
5. Customer opens app, sees new plan added

### Customer Buys Plan They Already Have
- GAS returns `status: 'info'` — no duplicate added

## Testing

### Test with curl (simulating Shopify webhook)
```bash
curl -X POST \
  https://nvdrvqamxoqezmfrnjcw.supabase.co/functions/v1/shopify-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "customer": {
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "User"
    },
    "line_items": [{
      "title": "Prep Program",
      "product_id": 12345
    }]
  }'
```

Note: Without the HMAC header, this only works if `SHOPIFY_WEBHOOK_SECRET` is not set (useful for testing).

### Test GAS directly
```bash
curl -X POST \
  YOUR_GAS_URL \
  -H "Content-Type: application/json" \
  -d '{
    "action": "addPlanToUser",
    "email": "test@example.com",
    "planName": "Prep Program",
    "fullName": "Test User",
    "isNewUser": true,
    "tempPassword": "TempPass123"
  }'
```

## Notes

- **No scadenza**: Plans purchased via Shopify have no expiration
- **Email**: Sent via GAS `MailApp.sendEmail()` (uses your Google account's daily quota: 100/day for free, 1500/day for Workspace)
- **Idempotent**: If webhook fires twice, no duplicate plans are added
- **Partial failure**: If GAS fails but Supabase user was created, returns status 207 with `partialSuccess: true`
