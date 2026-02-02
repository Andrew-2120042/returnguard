# ReturnGuard Shopify Setup Guide

This guide walks you through setting up ReturnGuard for local development and production deployment.

## Prerequisites

- Node.js 18+ installed
- A Shopify Partner account (free)
- A Supabase account (free tier available)
- An Upstash account (free tier available)

## Table of Contents

1. [Create Shopify Partner Account](#1-create-shopify-partner-account)
2. [Create Development Store](#2-create-development-store)
3. [Create Shopify App](#3-create-shopify-app)
4. [Set Up Supabase Database](#4-set-up-supabase-database)
5. [Set Up Upstash Redis](#5-set-up-upstash-redis)
6. [Generate Encryption Keys](#6-generate-encryption-keys)
7. [Configure Environment Variables](#7-configure-environment-variables)
8. [Run Database Migrations](#8-run-database-migrations)
9. [Install App to Development Store](#9-install-app-to-development-store)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Create Shopify Partner Account

1. Visit [partners.shopify.com](https://partners.shopify.com)
2. Click "Sign Up" (top right)
3. Fill in your details:
   - Business email
   - Password
   - Agree to Partner Program Agreement
4. Verify your email address
5. Complete your partner profile

**Why?** Partner accounts let you create development stores and apps for free.

---

## 2. Create Development Store

1. Log into your [Partner Dashboard](https://partners.shopify.com)
2. Navigate to **Stores** in the left sidebar
3. Click **Add store** button
4. Select **Create development store**
5. Configure your store:
   - **Store name**: Choose a unique name (e.g., "returnguard-dev")
   - **Store type**: Select "Development store"
   - **Data**: Choose "Start with test data" (highly recommended - pre-populates orders/customers)
   - **Purpose**: Select "Test an app or theme"
6. Click **Create development store**
7. Wait 30-60 seconds for store creation
8. Click on your store name to access the admin

**Important**: Save your store URL (e.g., `returnguard-dev.myshopify.com`). You'll need this later.

**Test Data**: If you selected "Start with test data", your store will have:
- 50+ sample orders
- 20+ sample customers
- Product catalog
- This makes testing much easier!

---

## 3. Create Shopify App

1. In your [Partner Dashboard](https://partners.shopify.com), navigate to **Apps**
2. Click **Create app** button
3. Select **Create app manually**
4. Fill in app details:
   - **App name**: `ReturnGuard` (or your preferred name)
   - Click **Create**

### 3.1 Configure App URLs

1. In your app dashboard, go to **Configuration** tab
2. Under **URLs** section:
   - **App URL**: `http://localhost:3000`
   - **Allowed redirection URL(s)**:
     ```
     http://localhost:3000/api/auth/shopify/callback
     ```
   - Click **Save**

**For Production**: Replace `http://localhost:3000` with your production domain (e.g., `https://yourapp.com`)

### 3.2 Configure API Scopes

1. Still in **Configuration** tab
2. Scroll to **API access scopes** section
3. Select the following scopes:
   - `read_orders` - Read order data
   - `read_customers` - Read customer data
   - `read_refunds` - Read refund data (for returns tracking)
   - `write_webhooks` - Register webhooks programmatically

**CRITICAL**: Use `write_webhooks` NOT `write_script_tags`

4. Click **Save**

### 3.3 Get API Credentials

1. In **Configuration** tab, scroll to **Client credentials**
2. Copy the following values:
   - **Client ID** → This is your `SHOPIFY_API_KEY`
   - **Client secret** → This is your `SHOPIFY_API_SECRET`
3. Save these in a secure location (you'll add them to `.env.local` later)

**Security**: Never commit these credentials to git or share them publicly.

### 3.4 Configure GDPR Webhooks (Required for App Store)

1. In **Configuration** tab, scroll to **GDPR mandatory webhooks**
2. Enter the following URLs:
   - **Customer data request**: `http://localhost:3000/api/webhooks/gdpr/customers-data-request`
   - **Customer data erasure**: `http://localhost:3000/api/webhooks/gdpr/customers-redact`
   - **Shop data erasure**: `http://localhost:3000/api/webhooks/gdpr/shop-redact`
3. Click **Save**

**For Production**: Replace `http://localhost:3000` with your production domain.

---

## 4. Set Up Supabase Database

### 4.1 Create Supabase Project

1. Visit [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **New Project**
4. Configure your project:
   - **Organization**: Select or create one
   - **Name**: `returngaurd` (or your preferred name)
   - **Database Password**: Generate a strong password (save it securely)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is sufficient for development
5. Click **Create new project**
6. Wait 2-3 minutes for project provisioning

### 4.2 Get Supabase Credentials

1. In your project dashboard, go to **Settings** (gear icon in sidebar)
2. Navigate to **API** section
3. Copy the following:
   - **Project URL** → This is your `SUPABASE_URL`
   - **anon public** key → This is your `SUPABASE_ANON_KEY`
   - **service_role** key (click "Reveal" first) → This is your `SUPABASE_SERVICE_KEY`

**Security**: The `service_role` key bypasses Row Level Security. Only use it server-side. Never expose it in client code.

### 4.3 Prepare for Migration

You'll run the database migration in step 8 after configuring environment variables.

---

## 5. Set Up Upstash Redis

Upstash Redis is required for distributed rate limiting across multiple server instances (crucial for Vercel deployments).

### 5.1 Create Upstash Account

1. Visit [console.upstash.com](https://console.upstash.com)
2. Sign up with GitHub or email
3. Verify your email if required

### 5.2 Create Redis Database

1. Click **Create Database**
2. Configure your database:
   - **Name**: `returngaurd-ratelimit` (or your preferred name)
   - **Type**: Select **Global** (recommended for best performance worldwide)
   - **Primary Region**: Choose closest to your servers
   - **Read Regions**: Optional, but recommended for global apps
3. Click **Create**

### 5.3 Get Redis Credentials

1. Click on your database name
2. Scroll to **REST API** section
3. Copy the following:
   - **UPSTASH_REDIS_REST_URL**
   - **UPSTASH_REDIS_REST_TOKEN**

**Why Redis?** Shopify rate limits are 40 calls per 20 seconds per store. With multiple Vercel instances, you need shared state to track rate limits accurately. In-memory counters don't work across instances.

---

## 6. Generate Encryption Keys

ReturnGuard encrypts Shopify access tokens before storing them in the database. You need to generate secure encryption keys.

### 6.1 Generate Encryption Key

Run this command in your terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Output example**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

**Save this output** → This is your `ENCRYPTION_KEY`

### 6.2 Generate Session Secret

Run this command in your terminal:

```bash
openssl rand -base64 32
```

**Output example**: `XyZ1234567890abcdefghijklmnopqrstuv==`

**Save this output** → This is your `SESSION_SECRET`

**CRITICAL SECURITY WARNING**:
- Generate NEW keys for each environment (dev, staging, production)
- NEVER commit these keys to git
- NEVER share these keys publicly
- Store production keys in secure secret management (Vercel Environment Variables, AWS Secrets Manager, etc.)
- If keys are compromised, rotate them immediately

---

## 7. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` in your editor

3. Fill in all variables with the credentials you collected:

```env
# Shopify Configuration
SHOPIFY_API_KEY=your_client_id_from_step_3
SHOPIFY_API_SECRET=your_client_secret_from_step_3
SHOPIFY_SCOPES=read_orders,read_customers,read_refunds,write_webhooks
SHOPIFY_APP_URL=http://localhost:3000
SHOPIFY_API_VERSION=2024-01

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_from_step_4
SUPABASE_SERVICE_KEY=your_service_key_from_step_4

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_from_step_5

# Encryption (Generated in step 6)
ENCRYPTION_KEY=your_generated_hex_key_from_step_6.1
SESSION_SECRET=your_generated_secret_from_step_6.2

# Application Environment
NODE_ENV=development
```

4. Save the file

**Git Safety**: The `.gitignore` file already excludes `.env.local` from version control.

---

## 8. Run Database Migrations

Now that environment variables are configured, create the database schema.

### 8.1 Open Supabase SQL Editor

1. Go to your [Supabase project dashboard](https://app.supabase.com)
2. Click on **SQL Editor** in the left sidebar
3. Click **New query**

### 8.2 Run First Migration (Core Schema)

1. Open `supabase/migrations/001_initial_schema.sql` in your code editor
2. Copy the entire SQL content
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify you see "SUCCESS: All 7 tables created successfully"

### 8.3 Run Second Migration (Fraud Intelligence Foundation)

1. Click **New query** in Supabase SQL Editor
2. Open `supabase/migrations/002_fraud_intelligence_foundation.sql` in your code editor
3. Copy the entire SQL content
4. Paste it into the Supabase SQL Editor
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. Verify you see "Migration 002 completed successfully!"

**What this adds**:
- Cross-merchant fraud intelligence (opt-in, privacy-preserving)
- Merchant fraud policies (auto-approve, flag-review, auto-block)
- Fraud alerts and notifications
- Customer hashing for cross-store fraud detection
- See `docs/FRAUD_INTELLIGENCE_FOUNDATION.md` for details

### 8.4 Verify Tables Created

1. In Supabase, navigate to **Table Editor** in the left sidebar
2. You should see the following tables:
   - `merchants` (with new columns: data_sharing_enabled, data_sharing_consent_at)
   - `customers` (with new columns: email_hash, phone_hash, billing_address_hash)
   - `orders`
   - `returns`
   - `fraud_signals`
   - `background_jobs`
   - `billing_plans`
   - `fraud_intelligence` ✨ NEW
   - `merchant_policies` ✨ NEW
   - `fraud_alerts` ✨ NEW

**Troubleshooting**: If you see errors, check:
- Is your `SUPABASE_SERVICE_KEY` correct in `.env.local`?
- Did you copy the entire migration file?
- Try running each table creation separately to identify the issue

---

## 9. Install App to Development Store

### 9.1 Start Development Server

```bash
npm run dev
```

Wait for the server to start. You should see:
```
  ▲ Next.js 14.1.0
  - Local:        http://localhost:3000
```

### 9.2 Install App

1. Open your browser
2. Navigate to:
   ```
   http://localhost:3000/api/auth/shopify/install?shop=your-store.myshopify.com
   ```
   Replace `your-store.myshopify.com` with your development store domain from step 2.

3. You'll be redirected to Shopify OAuth consent screen
4. Review the permissions:
   - Read orders
   - Read customers
   - Read refunds
   - Write webhooks
5. Click **Install app**

### 9.3 OAuth Callback & Background Setup

1. After clicking "Install app", you'll be redirected to:
   ```
   http://localhost:3000/dashboard?setup=pending
   ```

2. You'll see a **Setup Progress** UI showing:
   - ✓ App installed successfully
   - ⏳ Registering webhooks...
   - ⏳ Syncing historical data...

3. This happens in the background (takes 1-5 minutes depending on data volume):
   - Webhooks are registered (orders/create, refunds/create, GDPR endpoints)
   - Initial sync pulls last 12 months of orders
   - Returns are extracted from refunds
   - Customer stats are calculated

4. Once complete, you'll see the full dashboard with your data

### 9.4 Verify Installation

1. **Check Webhooks**: Go to Shopify Admin → Settings → Notifications → Webhooks
   - You should see webhooks pointing to your app
   - Topics: orders/create, refunds/create

2. **Check Database**: In Supabase Table Editor
   - `merchants` table should have 1 row (your store)
   - `orders` table should have historical orders
   - `customers` table should have customers with stats
   - `returns` table should have refunds (if any exist)

3. **Check Dashboard**: Visit `http://localhost:3000/dashboard`
   - Total Customers, Orders, Returns should show counts
   - Customer list should be populated
   - Click on a customer to see their detail page with timeline

---

## 10. Troubleshooting

### Issue: "OAuth redirect_uri mismatch"

**Cause**: The callback URL in Shopify app config doesn't match your request.

**Fix**:
1. Go to Partner Dashboard → Apps → Your App → Configuration
2. Verify "Allowed redirection URL(s)" is exactly:
   ```
   http://localhost:3000/api/auth/shopify/callback
   ```
3. Make sure there's no trailing slash
4. Click Save
5. Try installing again

### Issue: "Invalid HMAC signature"

**Cause**: Your `SHOPIFY_API_SECRET` is incorrect.

**Fix**:
1. Go to Partner Dashboard → Apps → Your App → Configuration
2. Re-copy the Client Secret
3. Update `SHOPIFY_API_SECRET` in `.env.local`
4. Restart your dev server
5. Try installing again

### Issue: "Rate limit exceeded (429 error)"

**Cause**: Too many API calls to Shopify.

**Fix**:
- ReturnGuard has automatic rate limiting (40 calls per 20 seconds)
- If you're still hitting limits, check:
  1. Is Upstash Redis configured correctly?
  2. Are `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set?
  3. Check Redis logs in Upstash dashboard

### Issue: "Webhooks not registering"

**Cause**: Background jobs might not be processing.

**Fix**:
1. Check `background_jobs` table in Supabase
2. Look for jobs with status 'pending' or 'failed'
3. Check server logs for errors
4. Manually trigger webhook registration:
   ```
   curl http://localhost:3000/api/webhooks/register
   ```

### Issue: "Initial sync stuck at 0%"

**Cause**: Background job processor might not be running, or API rate limits.

**Fix**:
1. Check server console logs for errors
2. Verify Shopify API credentials are correct
3. Check if your development store has orders (Settings → Store details → Test data)
4. Check `merchants` table → `sync_status` field (should be 'syncing')
5. Check `background_jobs` table for error messages

### Issue: "Access token encryption failed"

**Cause**: `ENCRYPTION_KEY` is not set or invalid.

**Fix**:
1. Verify `ENCRYPTION_KEY` in `.env.local` is a valid 64-character hex string
2. Regenerate key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. Update `.env.local`
4. Restart server
5. Try installing again

### Issue: "Database connection failed"

**Cause**: Supabase credentials are incorrect or project is paused.

**Fix**:
1. Check Supabase project status (free tier projects pause after 1 week inactivity)
2. Verify `SUPABASE_URL` matches your project URL
3. Verify `SUPABASE_SERVICE_KEY` is correct (not the anon key)
4. Check Supabase dashboard for error logs

### Issue: "Session expired / Redirected to login"

**Cause**: Session cookies expired or `SESSION_SECRET` changed.

**Fix**:
1. Clear browser cookies for localhost:3000
2. Verify `SESSION_SECRET` is set in `.env.local`
3. Restart server
4. Reinstall app

### Still Having Issues?

1. Check server console logs for detailed error messages
2. Check browser console (F12) for client-side errors
3. Verify all environment variables are set correctly
4. Try removing and reinstalling the app
5. Check that your development store has test data

---

## Next Steps

Once setup is complete:

1. **Test the OAuth flow**: Uninstall and reinstall the app to verify the flow
2. **Test webhook sync**: Create a new order in Shopify admin, verify it appears in dashboard
3. **Test billing**: Trigger upgrade flow (though you can't charge development stores)
4. **Explore the dashboard**: Navigate through customers, orders, returns pages
5. **Check customer timeline**: Click on a customer to see their order/return history

**Ready for Production?**

See `docs/DEPLOYMENT.md` for instructions on deploying to Vercel with production Shopify app configuration.

---

## Security Checklist

Before going live, verify:

- [ ] `.env.local` is in `.gitignore` (already included)
- [ ] Encryption keys are unique and not shared across environments
- [ ] `SUPABASE_SERVICE_KEY` is never used in client-side code
- [ ] Shopify webhook requests are verified with HMAC signatures
- [ ] Session cookies are HTTP-only and Secure (in production)
- [ ] Rate limiting is enabled and working
- [ ] GDPR webhooks are responding correctly
- [ ] Access tokens are encrypted in database (not plaintext)

---

## Development Tips

- **Hot reload**: Next.js automatically reloads when you edit code
- **Database changes**: Use Supabase migrations for schema changes
- **Test data**: Use Shopify's "Populate test data" feature for realistic testing
- **Webhook testing**: Use Shopify's webhook testing tool in admin
- **Rate limit testing**: Monitor Upstash Redis dashboard to see rate limit hits
- **Debug mode**: Set `NODE_ENV=development` for detailed error messages

---

## Resources

- [Shopify App Development Docs](https://shopify.dev/docs/apps)
- [Shopify API Reference](https://shopify.dev/docs/api/admin-rest)
- [Supabase Documentation](https://supabase.com/docs)
- [Upstash Redis Docs](https://docs.upstash.com/redis)
- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Vercel Deployment Guide](https://vercel.com/docs)
