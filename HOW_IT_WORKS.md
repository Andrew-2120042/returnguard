# ReturnGuard - How It Works

**ReturnGuard** is a Shopify app that detects and prevents return fraud using AI-powered risk analysis and cross-store intelligence.

---

## Table of Contents

1. [Quick Overview](#quick-overview)
2. [Architecture](#architecture)
3. [How Merchants Install the App](#how-merchants-install-the-app)
4. [Data Flow](#data-flow)
5. [Fraud Detection Engine](#fraud-detection-engine)
6. [Key Features](#key-features)
7. [Security & Privacy](#security--privacy)
8. [Tech Stack](#tech-stack)

---

## Quick Overview

### The Problem
Merchants lose billions to return fraud each year:
- **Wardrobing**: Customers buy items (especially dresses), wear them to events, then return
- **Serial Returners**: Customers with extremely high return rates (80%+)
- **Cross-Store Fraud**: Same fraudster hits multiple stores
- **Policy Abuse**: Exploiting generous return policies

### The Solution
ReturnGuard automatically:
1. ✅ Monitors all orders and returns from Shopify
2. ✅ Calculates risk scores (0-100) for every customer
3. ✅ Detects fraud patterns (wardrobing, serial returners, velocity spikes)
4. ✅ Generates real-time fraud alerts
5. ✅ Shares intelligence across stores (anonymized)
6. ✅ Helps merchants make informed decisions

---

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React + TypeScript
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Cache/Rate Limiting**: Upstash Redis (distributed)
- **Authentication**: Shopify OAuth 2.0
- **Encryption**: PBKDF2 + AES-256-GCM
- **UI**: shadcn/ui + Tailwind CSS

### Project Structure
```
returngaurd/
├── app/
│   ├── api/                    # API Routes
│   │   ├── auth/               # Shopify OAuth
│   │   ├── data/               # Customer, order, return endpoints
│   │   ├── fraud/              # Fraud analysis & intelligence
│   │   ├── webhooks/           # Shopify webhook handlers
│   │   ├── billing/            # Subscription management
│   │   └── admin/              # Admin security dashboard
│   ├── dashboard/              # Dashboard UI pages
│   │   ├── customers/          # Customer list & detail
│   │   ├── orders/             # Orders list
│   │   ├── returns/            # Returns list
│   │   └── fraud/              # Fraud alerts & intelligence
│   └── page.tsx                # Landing page
├── lib/
│   ├── crypto.ts               # Encryption utilities
│   ├── session.ts              # Session management
│   ├── supabase.ts             # Supabase client
│   ├── redis.ts                # Redis client
│   ├── rate-limit.ts           # Rate limiting
│   ├── fraud-engine.ts         # Fraud detection logic
│   └── shopify.ts              # Shopify API client
├── components/
│   ├── ui/                     # Base UI components
│   └── dashboard/              # Dashboard components
├── supabase/migrations/        # Database schema
└── middleware.ts               # Request middleware
```

---

## How Merchants Install the App

### Step 1: OAuth Installation Flow

1. **Merchant clicks "Install App"** on Shopify App Store
2. **Redirected to Shopify OAuth screen**
   - Requests permissions: read_orders, read_customers, read_refunds, write_webhooks
3. **Merchant approves permissions**
4. **Shopify redirects back** to `/api/auth/shopify/callback`
5. **App receives access token** from Shopify

### Step 2: App Setup Process

```
/api/auth/shopify/callback
  ↓
1. Exchange authorization code for access token
2. Encrypt access token with AES-256-GCM
3. Store merchant in Supabase database:
   - shop_domain
   - shopify_shop_id
   - encrypted_access_token
   - plan (free, professional, enterprise)
4. Create encrypted session cookie
5. Register Shopify webhooks:
   - orders/create
   - refunds/create
   - customers/update
6. Redirect merchant to dashboard
```

### Step 3: Initial Data Sync

The app immediately starts syncing historical data:

```
Background Job: sync-shopify-data
  ↓
1. Fetch last 250 customers from Shopify
2. Fetch last 250 orders from Shopify
3. Fetch all refunds from last 90 days
4. Store in Supabase
5. Calculate initial risk scores
6. Generate fraud alerts if needed
```

---

## Data Flow

### Real-Time Flow (When Orders/Returns Happen)

```
1. CUSTOMER MAKES PURCHASE
   ↓
Shopify → [Webhook: orders/create] → /api/webhooks/shopify/orders
   ↓
Store order in database
Calculate customer stats (total_orders, total_spent)

2. CUSTOMER RETURNS ITEM
   ↓
Shopify → [Webhook: refunds/create] → /api/webhooks/shopify/refunds
   ↓
Store return in database
   ↓
TRIGGER: queue_fraud_analysis_for_return()
   ↓
Insert background job into queue
   ↓
3. FRAUD ANALYSIS (Automatic)
   ↓
Background worker processes job
   ↓
Run fraud detection engine:
  - Calculate return velocity
  - Check return patterns
  - Compare to historical behavior
  - Check cross-store intelligence
   ↓
Update return with fraud_confidence score (0-100)
Update customer risk_score
   ↓
4. IF HIGH RISK (score > 70)
   ↓
Create fraud_alert record
   ↓
Merchant sees alert in dashboard
```

### Dashboard Data Flow

```
Merchant opens dashboard
   ↓
Browser → GET /dashboard
   ↓
Server checks session cookie
   ↓
IF NOT AUTHENTICATED:
  → Redirect to Shopify OAuth
   ↓
IF AUTHENTICATED:
  → Render dashboard page (React Server Component)
   ↓
Client → GET /api/data/customers
   ↓
Server:
  1. Validate session
  2. Apply rate limiting (100 req/min)
  3. Query Supabase with RLS
  4. Return JSON
   ↓
Client renders data table with risk badges
```

---

## Fraud Detection Engine

### Risk Scoring Algorithm

Located in `lib/fraud-engine.ts`, the engine calculates a 0-100 risk score based on:

#### 1. **Return Rate** (40% weight)
```typescript
// If return_rate > 70% → High risk
// If return_rate > 50% → Medium risk
// If return_rate < 30% → Low risk

const returnRateFactor = (customer.return_rate / 100) * 40;
```

#### 2. **Return Velocity** (30% weight)
```typescript
// How quickly are returns happening?
// Returns within 3 days of delivery → Suspicious
// Many returns in short time window → Red flag

const daysSinceOrder = dateDiff(order.created_at, return.created_at);
if (daysSinceOrder < 3) velocityScore += 30;
```

#### 3. **Return Patterns** (20% weight)
```typescript
// Detect specific fraud patterns:
// - Wardrobing: Same item type, worn condition, quick return
// - Serial: Many returns with different excuses
// - Bracketing: Buying multiple sizes, returning all but one

if (return.reason === 'wore once to event') wardrobingScore += 20;
if (customer.total_returns > 10) serialReturnerScore += 15;
```

#### 4. **Cross-Store Intelligence** (10% weight)
```typescript
// Check if this customer (email/phone hash) has high fraud
// score at OTHER stores in the network

const intelligence = await getFraudIntelligence(
  'customer',
  hashEmail(customer.email)
);

if (intelligence.fraud_count > 3) crossStoreScore += 10;
```

### Fraud Signal Detection

The engine detects these patterns:

1. **Wardrobing**
   - Return reason contains: "wore", "event", "wedding", "one time"
   - Quick turnaround (< 5 days)
   - High-value items (dresses, suits)

2. **Serial Returner**
   - Return rate > 70%
   - 10+ returns total
   - Consistent pattern over time

3. **Velocity Spike**
   - 5+ returns in last 30 days
   - Sudden increase from normal behavior

4. **Policy Abuse**
   - Returns at exactly 29 days (for 30-day policy)
   - Always returns right before policy deadline

5. **Bracketing**
   - Orders multiple sizes of same item
   - Returns all except one
   - Repeat pattern

### Risk Levels

```typescript
if (score < 40)  → risk_level = 'low'      // 🟢 Green
if (score < 70)  → risk_level = 'medium'   // 🟡 Yellow
if (score < 90)  → risk_level = 'high'     // 🟠 Orange
if (score >= 90) → risk_level = 'critical' // 🔴 Red
```

---

## Key Features

### 1. Customer Risk Profiles

**What it does**: Tracks every customer's return behavior and calculates risk score

**Data tracked**:
- Total orders
- Total returns
- Return rate (%)
- Average order value
- Return velocity (returns per 30 days)
- Risk score (0-100)
- Risk level (low/medium/high/critical)

**Dashboard view**: `app/dashboard/customers/page.tsx`

### 2. Fraud Alerts

**What it does**: Generates real-time alerts when high-risk behavior is detected

**Alert types**:
- `high_risk_return` - Single return with score > 80
- `serial_returner` - Customer with return rate > 70%
- `cross_store_fraud` - Flagged by other merchants
- `velocity_spike` - Sudden increase in returns
- `policy_violation` - Abusing return policy

**Alert severities**:
- Low: FYI, monitor
- Medium: Review recommended
- High: Investigation needed
- Critical: Block/restrict immediately

**Dashboard view**: `app/dashboard/fraud/alerts/page.tsx`

### 3. Cross-Store Intelligence Network

**What it does**: Anonymously shares fraud data across all ReturnGuard merchants

**How it works**:
```
Merchant A detects fraudster (email: fraud@example.com)
   ↓
Store in fraud_intelligence table:
  - entity_type: 'customer'
  - entity_hash: SHA256(fraud@example.com)
  - fraud_count: 1
  - total_merchants: 1
  - avg_fraud_score: 92
   ↓
Fraudster tries to buy from Merchant B
   ↓
Merchant B checks intelligence:
  - Hash customer email
  - Query fraud_intelligence
  - Find match: fraud_count = 1, avg_score = 92
   ↓
Merchant B sees warning:
  "⚠️ This customer flagged by 1 other store (avg risk: 92)"
```

**Privacy**: Only hashed identifiers shared, never actual emails/phones

**Dashboard view**: `app/dashboard/fraud/intelligence/page.tsx`

### 4. Return Timeline & Patterns

**What it does**: Visualizes customer's complete order and return history

**Shows**:
- Chronological timeline of all orders
- Which orders had returns
- Time between order and return
- Return reasons
- Fraud confidence for each return

**Dashboard view**: `app/dashboard/customers/[id]/page.tsx`

### 5. Billing & Quota System

**What it does**: Enforces plan limits and manages subscriptions

**Plans**:
- **Free**: 25 returns/month
- **Professional**: 100 returns/month ($29/mo)
- **Enterprise**: Unlimited returns ($99/mo)

**Quota tracking**:
```typescript
// Every time a return is analyzed:
INCREMENT merchant.returns_used_this_month

// If quota exceeded:
CREATE fraud_alert(type: 'quota_exceeded')
DISABLE fraud analysis
```

**Dashboard**: Shows usage vs quota in header

### 6. Security Features

**Rate Limiting** (`lib/rate-limit.ts`):
```typescript
// Standard endpoints: 100 req/min
// Sensitive endpoints: 10 req/min
// Auth endpoints: 5 req/min per IP

if (rateLimitExceeded) {
  return Response(429, 'Too Many Requests');
}
```

**Row Level Security** (Supabase):
```sql
-- Merchants can only see their own data
CREATE POLICY merchant_isolation ON customers
  FOR ALL
  USING (merchant_id = current_setting('app.merchant_id')::uuid);
```

**Encryption**:
- Access tokens: AES-256-GCM
- Session cookies: Encrypted + signed
- Sensitive data: PBKDF2 + salt

---

## Security & Privacy

### Data Protection

1. **Encryption at Rest**
   - All access tokens encrypted with AES-256-GCM
   - Unique IV and auth tag per token
   - Key derived from merchant ID + global secret

2. **Encryption in Transit**
   - All API calls over HTTPS
   - TLS 1.3 enforced
   - Strict CSP headers

3. **Row Level Security (RLS)**
   - Database enforces merchant isolation
   - Impossible to access other merchant's data
   - Even with SQL injection

4. **Session Security**
   - HTTP-only cookies (no JavaScript access)
   - Secure flag in production
   - SameSite=lax protection
   - 30-day expiry

### Privacy Compliance

**GDPR Compliance**:
```
/api/webhooks/gdpr/customers-data-request
  → Returns all data for customer
  → Within 30 days

/api/webhooks/gdpr/customers-redact
  → Deletes all customer data
  → Within 30 days

/api/webhooks/gdpr/shop-redact
  → Deletes all merchant data
  → When app is uninstalled
```

**Data Sharing**:
- Merchants control via `data_sharing_enabled` flag
- Only hashed identifiers shared (SHA-256)
- No PII in cross-store intelligence
- Merchants can opt out anytime

---

## Tech Stack Details

### Database Schema

**Key Tables**:

1. **merchants** - Shopify stores using ReturnGuard
   - Encrypted access tokens
   - Plan & quota tracking
   - Settings

2. **customers** - Shopify customers
   - Contact info
   - Risk score & level
   - Return statistics
   - Hashed identifiers (for intelligence)

3. **orders** - Shopify orders
   - Order details
   - Line items (JSONB)
   - Financial status

4. **returns** - Refunds/returns
   - Return reason
   - Fraud confidence score (0-100)
   - Is fraudulent flag
   - Analysis metadata

5. **fraud_alerts** - Real-time alerts
   - Alert type & severity
   - Message
   - Read/acknowledged status

6. **fraud_intelligence** - Cross-store data
   - Entity type (customer/email/phone)
   - Entity hash (SHA-256)
   - Fraud statistics
   - No PII

7. **background_jobs** - Async task queue
   - Job type (fraud-analysis, sync-data)
   - Status (pending/running/completed)
   - Retry logic

### API Endpoints

**Authentication**:
- `GET /api/auth/shopify/install` - Start OAuth
- `GET /api/auth/shopify/callback` - Complete OAuth

**Data**:
- `GET /api/data/customers` - List customers
- `GET /api/data/customers/:id` - Customer detail
- `GET /api/data/orders` - List orders
- `GET /api/data/returns` - List returns

**Fraud**:
- `GET /api/fraud/alerts` - Active fraud alerts
- `POST /api/fraud/alerts/:id/acknowledge` - Mark alert as handled
- `GET /api/fraud/intelligence/stats` - Cross-store statistics
- `GET /api/fraud/intelligence/top-fraudsters` - Most flagged entities

**Webhooks** (from Shopify):
- `POST /api/webhooks/shopify/orders` - Order created
- `POST /api/webhooks/shopify/refunds` - Refund created
- `POST /api/webhooks/shopify/customers` - Customer updated

**Billing**:
- `POST /api/billing/subscribe` - Upgrade plan
- `GET /api/billing/check-quota` - Check usage

---

## How to Test Locally

### Current Test Data

The database has 3 test customers:

1. **Sarah Johnson** (sarah.johnson@example.com)
   - Risk: 15 (LOW) 🟢
   - 10 orders, 1 return
   - Legitimate customer

2. **Jane Smith** (jane.smith@example.com)
   - Risk: 88 (HIGH) 🟠
   - 8 orders, 6 returns
   - Wardrobing pattern

3. **John Returner** (john.returner@fraud.com)
   - Risk: 92 (CRITICAL) 🔴
   - 12 orders, 10 returns
   - Serial returner

### Access Dashboard

```bash
# Server running at http://localhost:3000

# Dashboard (dev mode, no auth required)
http://localhost:3000/dashboard

# View customers with risk scores
http://localhost:3000/dashboard/customers

# View fraud alerts (2 pending)
http://localhost:3000/dashboard/fraud/alerts

# Test API directly
curl http://localhost:3000/api/data/customers | jq
```

### Development Session

When `ENABLE_DEV_SESSION=true` in `.env.local`:
- Bypasses Shopify OAuth
- Uses mock session with test merchant ID
- All API calls work as if authenticated
- **ONLY for local development**

---

## Production Deployment

### Environment Variables Needed

```bash
# Shopify (from Partner Dashboard)
SHOPIFY_API_KEY=your_app_key
SHOPIFY_API_SECRET=your_app_secret
SHOPIFY_APP_URL=https://yourapp.com
SHOPIFY_SCOPES=read_orders,read_customers,read_refunds,write_webhooks

# Supabase (from Supabase Dashboard)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Upstash Redis (from Upstash Console)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Generated Secrets (use openssl rand -base64 32)
ENCRYPTION_KEY=...
SESSION_SECRET=...
CRON_SECRET=...
ADMIN_API_KEY=...
SALT_SECRET_KEY=...

# Feature Flags
NODE_ENV=production
CROSS_STORE_FRAUD_ENABLED=true
ENABLE_DEV_SESSION=false  # MUST be false in production
```

### Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `ENABLE_DEV_SESSION=false`
- [ ] Run database migrations
- [ ] Configure Shopify app URLs
- [ ] Set up Shopify webhooks
- [ ] Test OAuth flow
- [ ] Enable rate limiting
- [ ] Configure monitoring
- [ ] Test GDPR webhooks

---

## How Merchants Use It Daily

### Morning Routine

1. **Check Dashboard** (`/dashboard`)
   - See overnight order/return stats
   - Check pending fraud alerts

2. **Review Fraud Alerts** (`/dashboard/fraud/alerts`)
   - See high-risk returns flagged overnight
   - Investigate suspicious customers
   - Acknowledge/dismiss alerts

3. **Investigate High-Risk Customers** (`/dashboard/customers`)
   - Sort by risk score (highest first)
   - Click into customer profiles
   - Review return patterns and timeline

### When Customer Requests Return

1. **Look Up Customer** (`/dashboard/customers`)
   - Search by email or name
   - Check risk score

2. **Review Customer History**
   - See all past orders and returns
   - Check return rate
   - Look for patterns

3. **Make Decision**
   - Low risk (🟢): Approve return
   - Medium risk (🟡): Review reason
   - High risk (🟠): Ask questions
   - Critical risk (🔴): Deny or restrict

### Weekly Review

1. **Check Cross-Store Intelligence** (`/dashboard/fraud/intelligence`)
   - See if any of your customers are flagged by other stores
   - Review top fraudsters in the network

2. **Analyze Trends**
   - Return rate trends
   - Most common fraud patterns
   - Which products have highest return rates

---

## Summary

**ReturnGuard works by:**

1. ✅ Installing via Shopify OAuth (one-click)
2. ✅ Syncing orders, customers, and returns via webhooks
3. ✅ Running fraud detection on every return (automatic)
4. ✅ Calculating risk scores using ML-style algorithms
5. ✅ Generating real-time fraud alerts
6. ✅ Sharing intelligence across merchants (anonymized)
7. ✅ Providing a dashboard to make informed decisions

**Merchants get:**
- Real-time fraud detection
- Customer risk profiles
- Fraud alerts and recommendations
- Cross-store intelligence network
- Save money by preventing fraud
- Fair treatment of legitimate customers

**Tech highlights:**
- Built on Next.js 14 + TypeScript
- Supabase for database with RLS
- Redis for rate limiting
- Military-grade encryption
- GDPR compliant
- Scales to millions of transactions

---

**🚀 Your ReturnGuard app is running at: http://localhost:3000/dashboard**

Open it now to see fraud detection in action with the 3 test customers!
