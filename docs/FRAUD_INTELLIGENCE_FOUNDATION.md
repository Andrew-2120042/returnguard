# Fraud Intelligence Foundation (Phase 1)

## Overview

This document describes the fraud intelligence foundation added to Phase 1 of ReturnGuard. These database structures lay the groundwork for Phase 3's cross-merchant fraud detection while remaining privacy-conscious and opt-in.

## Key Components

### 1. Fraud Intelligence Table

**Purpose**: Aggregate fraud patterns across all merchants (who opt-in) to identify serial fraudsters.

**Privacy**: All personally identifiable information is hashed using SHA-256 before storage.

**Structure**:
- Tracks entities: email, IP address, phone, device fingerprint, billing address
- Aggregates: total orders, returns, chargebacks across merchants
- Calculates: return rate, chargeback rate, fraud score
- Tracks: merchant count (how many stores have seen this entity)

**Example Use Case**:
```
Email "fraudster@example.com" (hashed):
- Seen by 5 merchants
- 50 total orders
- 48 returns (96% return rate)
- Fraud score: 95/100
- Confirmed fraud: true
```

### 2. Merchant Data Sharing (Opt-In)

**Fields Added to Merchants**:
- `data_sharing_enabled` (boolean, default: false)
- `data_sharing_consent_at` (timestamp)

**How It Works**:
1. Merchant explicitly opts in via dashboard (Phase 2)
2. When enabled, anonymized data flows to `fraud_intelligence` table
3. Merchant benefits from community intelligence (identifies fraudsters faster)
4. Merchant contributes to community (helps other merchants)

**Privacy Guarantees**:
- Only hashed identifiers are shared
- Original email/phone/address never stored in shared table
- Merchant can opt out at any time
- Individual transactions not shared, only aggregates

### 3. Customer Hashed Identifiers

**Fields Added to Customers**:
- `email_hash` (SHA-256 of lowercase email + salt)
- `phone_hash` (SHA-256 of normalized phone + salt)
- `billing_address_hash` (SHA-256 of normalized address + salt)

**Automatic Calculation**:
- Trigger `calculate_customer_hashes()` runs on INSERT/UPDATE
- Hashes are generated automatically from customer data
- Uses consistent normalization (lowercase, remove spaces, etc.)

**Usage**:
```sql
-- Check if email exists in fraud intelligence
SELECT * FROM get_fraud_intelligence('email', 'customer@example.com');

-- Returns:
-- fraud_score: 85
-- total_appearances: 25
-- return_rate: 80%
-- merchant_count: 3
-- is_confirmed_fraud: false
```

### 4. Merchant Fraud Policies

**Purpose**: Define automated actions based on risk scores.

**Default Policies** (created automatically for each merchant):

| Policy Type | Risk Score Range | Default Actions |
|------------|------------------|-----------------|
| `auto_approve` | 0-25 (Low) | Allow return, no alerts |
| `flag_review` | 26-75 (Medium) | Send email, require receipt |
| `auto_block` | 76-100 (High) | Block return, critical alert |

**Customization** (Phase 2):
Merchants can adjust:
- Risk score thresholds
- Actions per policy
- Enable/disable policies

**Actions Config** (JSONB):
```json
{
  "send_email": true,
  "block_return": false,
  "require_receipt": true,
  "require_manager_approval": false,
  "alert_severity": "high"
}
```

### 5. Fraud Alerts

**Purpose**: Real-time notifications to merchants about suspicious activity.

**Alert Types**:
- `high_risk_return` - Return from high-risk customer
- `serial_returner` - Customer exceeds return threshold
- `cross_store_fraud` - Entity flagged by other merchants
- `quota_exceeded` - Merchant exceeded plan quota
- `policy_violation` - Return violates merchant policy
- `velocity_spike` - Unusual spike in returns

**Severity Levels**:
- `low` - Informational
- `medium` - Review recommended
- `high` - Action recommended
- `critical` - Immediate action required

**Features**:
- Unread/read tracking
- Acknowledgment tracking
- Metadata for context
- Linked to specific return/customer

**Dashboard Display** (Phase 2):
```
🔴 CRITICAL ALERT
Serial Returner Detected
Customer: j***n@example.com
Return Rate: 95% (48/50 orders)
Risk Score: 98/100
Seen by: 4 other merchants
[View Details] [Acknowledge]
```

## SQL Functions

### 1. `update_fraud_intelligence()`

**Purpose**: Update cross-merchant intelligence after each order/return.

**Parameters**:
- `entity_type`: 'email', 'ip_address', 'phone', etc.
- `entity_hash`: SHA-256 hash of the entity
- `is_return`: true if this is a return
- `merchant_id`: ID of the merchant

**Usage**:
```sql
-- Call after processing a return (if merchant opted in)
SELECT update_fraud_intelligence(
  'email',
  'abc123...', -- email hash
  true, -- is return
  'merchant-uuid'
);
```

**Behavior**:
- Only runs if merchant has `data_sharing_enabled = true`
- Inserts new entity or updates existing
- Increments counters (orders, returns, appearances)
- Recalculates rates automatically

### 2. `get_fraud_intelligence()`

**Purpose**: Lookup fraud intelligence for an entity.

**Parameters**:
- `entity_type`: 'email', 'ip_address', 'phone', etc.
- `entity_value`: Raw value (e.g., "customer@example.com")

**Returns**:
```sql
fraud_score         | 85
total_appearances   | 25
total_returns       | 20
return_rate         | 80.00
merchant_count      | 3
is_confirmed_fraud  | false
```

**Usage in Application**:
```typescript
// Check if customer is risky
const intelligence = await supabase.rpc('get_fraud_intelligence', {
  p_entity_type: 'email',
  p_entity_value: customer.email
});

if (intelligence.fraud_score > 75) {
  // Create alert, block return, etc.
}
```

### 3. `create_fraud_alert()`

**Purpose**: Create a fraud alert for a merchant.

**Parameters**:
- `merchant_id`, `return_id`, `customer_id`
- `alert_type`, `severity`, `message`
- `metadata` (optional JSONB)

**Usage**:
```typescript
await supabase.rpc('create_fraud_alert', {
  p_merchant_id: merchantId,
  p_return_id: returnId,
  p_customer_id: customerId,
  p_alert_type: 'high_risk_return',
  p_severity: 'critical',
  p_message: 'Customer has 95% return rate across 5 merchants',
  p_metadata: { risk_score: 98, merchant_count: 5 }
});
```

## Triggers

### 1. `trigger_calculate_customer_hashes`

**When**: Before INSERT or UPDATE on `customers` table

**What**: Automatically calculates hashes for:
- Email (lowercase + salt)
- Phone (digits only + salt)
- Billing address (normalized + salt)

**Why**: Ensures hashes are always present and consistent for cross-merchant matching.

### 2. `trigger_create_default_policies`

**When**: After INSERT on `merchants` table

**What**: Creates 3 default fraud policies (auto_approve, flag_review, auto_block)

**Why**: Every merchant starts with sensible defaults immediately.

## Integration Points (Phase 2)

### When Processing Returns

```typescript
// 1. Calculate customer risk score (Phase 2)
const riskScore = await calculateRiskScore(customer);

// 2. Check fraud intelligence (if data sharing enabled)
const intelligence = await supabase.rpc('get_fraud_intelligence', {
  p_entity_type: 'email',
  p_entity_value: customer.email
});

// 3. Apply merchant policy
const policy = await getApplicablePolicy(merchant, riskScore);

if (policy.type === 'auto_block') {
  // Block return
  await createFraudAlert(merchant, return, 'high_risk_return', 'critical');
  return { blocked: true, reason: 'High fraud risk' };
}

// 4. Update fraud intelligence (if merchant opted in)
if (merchant.data_sharing_enabled) {
  await supabase.rpc('update_fraud_intelligence', {
    p_entity_type: 'email',
    p_entity_hash: customer.email_hash,
    p_is_return: true,
    p_merchant_id: merchant.id
  });
}
```

### Dashboard Alerts (Phase 2)

```typescript
// Fetch unread alerts for merchant
const { data: alerts } = await supabase
  .from('fraud_alerts')
  .select('*')
  .eq('merchant_id', merchantId)
  .eq('is_read', false)
  .order('severity', { ascending: false })
  .order('created_at', { ascending: false });

// Display in dashboard with badge count
```

## Privacy & Security

### Hashing Strategy

**Salt**: `RETURNGAURD_SALT_V1` (hardcoded in functions)

**Algorithm**: SHA-256

**Normalization**:
- Email: lowercase, trim whitespace
- Phone: digits only (remove +, -, spaces, parentheses)
- Address: concatenate fields, lowercase, remove spaces

**Why Not Plain Text?**
- Protects customer privacy
- Prevents reverse lookups
- Complies with GDPR/CCPA
- Merchants can't see each other's customer data

### GDPR Compliance

**Data Stored**:
- ✅ Hashes only (not PII)
- ✅ Aggregates only (counts, rates)
- ✅ No individual transaction details

**Merchant Rights**:
- ✅ Opt-in required (default: disabled)
- ✅ Can opt-out anytime
- ✅ Data stops flowing immediately

**Customer Rights**:
- ✅ Can request deletion (hash removed from `fraud_intelligence`)
- ✅ Not personally identifiable (hash can't be reversed)

### Security Notes

**Salt Management**:
- Currently hardcoded in SQL functions
- Should be moved to environment variable (Phase 2)
- Version suffix allows salt rotation

**Hash Collisions**:
- SHA-256 has ~2^256 possible outputs
- Collision probability: negligible
- Even if collision, aggregate data not sensitive

## Views

### `merchant_alert_summary`

**Purpose**: Summary of alerts per merchant (for dashboard).

**Columns**:
- `total_alerts` - All time count
- `unread_alerts` - Current unread
- `critical_alerts` - Severity = critical
- `alerts_last_24h` - Recent activity
- `last_alert_at` - Most recent alert

**Usage**:
```sql
SELECT * FROM merchant_alert_summary WHERE merchant_id = 'uuid';
```

### `top_risky_entities`

**Purpose**: Admin view of riskiest entities (Phase 3 - admin dashboard).

**Filters**:
- Fraud score >= 50 OR confirmed fraud
- Top 1000 by score/returns

**Usage** (admin only):
```sql
SELECT * FROM top_risky_entities LIMIT 100;
```

## Migration Instructions

### Run Second Migration

1. **In Supabase Dashboard**:
   - Go to SQL Editor
   - Create new query
   - Copy contents of `supabase/migrations/002_fraud_intelligence_foundation.sql`
   - Run query
   - Verify: "Migration 002 completed successfully!"

2. **Verify Tables Created**:
   - `fraud_intelligence` (3 indexes)
   - `merchant_policies` (2 indexes)
   - `fraud_alerts` (4 indexes)

3. **Verify Columns Added**:
   - `merchants`: `data_sharing_enabled`, `data_sharing_consent_at`
   - `customers`: `email_hash`, `phone_hash`, `billing_address_hash`

4. **Verify Functions**:
   - `update_fraud_intelligence()`
   - `get_fraud_intelligence()`
   - `create_fraud_alert()`
   - `calculate_customer_hashes()`

5. **Verify Triggers**:
   - `trigger_calculate_customer_hashes` on `customers`
   - `trigger_create_default_policies` on `merchants`

### Test Hashing

```sql
-- Insert a test customer (hash should auto-calculate)
INSERT INTO customers (merchant_id, shopify_customer_id, email, phone)
VALUES (
  'your-merchant-uuid',
  'test-123',
  'test@example.com',
  '+1 (555) 123-4567'
);

-- Verify hashes were created
SELECT email, email_hash, phone, phone_hash FROM customers WHERE email = 'test@example.com';

-- Both should be populated with hex strings
```

### Test Default Policies

```sql
-- Create a test merchant (policies should auto-create)
INSERT INTO merchants (shop_domain, shopify_shop_id, /* other fields */)
VALUES ('test-shop.myshopify.com', '12345', /* ... */);

-- Verify 3 policies created
SELECT * FROM merchant_policies WHERE merchant_id = 'new-merchant-uuid';

-- Should see: auto_approve (0-25), flag_review (26-75), auto_block (76-100)
```

## Roadmap

### Phase 1 (Current)
- ✅ Database schema
- ✅ Hashing triggers
- ✅ SQL functions
- ✅ Default policies

### Phase 2
- Fraud detection engine
- Risk score calculation
- Policy enforcement
- Alert UI in dashboard
- Data sharing opt-in UI

### Phase 3
- Cross-merchant network
- Real-time fraud scoring
- Machine learning models
- Admin fraud dashboard
- Fraud pattern detection

## FAQs

**Q: Is customer data shared between merchants?**
A: No. Only anonymized hashes and aggregates are shared, and only if merchant opts in.

**Q: Can I see other merchants' customers?**
A: No. You only see aggregates (e.g., "this email has 80% return rate across 3 stores").

**Q: What if I don't want to share data?**
A: Data sharing is opt-in and disabled by default. You can keep using ReturnGuard without sharing.

**Q: What are the benefits of sharing?**
A: You identify serial fraudsters faster because you see patterns from other merchants.

**Q: Can a hash be reversed to get the email?**
A: No. SHA-256 is one-way. You can't get the original value from the hash.

**Q: What if I want to delete a customer's fraud data?**
A: When you delete a customer (GDPR), their hash is also removed from `fraud_intelligence`.

**Q: How often is fraud intelligence updated?**
A: Real-time. Every order/return updates the intelligence table (if merchant opted in).

**Q: Can I customize the fraud policies?**
A: Yes, in Phase 2 you'll be able to adjust thresholds and actions via dashboard.
