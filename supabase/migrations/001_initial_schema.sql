-- ReturnGuard Phase 1 Database Schema
-- Includes all fixes from Issues #1-#10

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MERCHANTS TABLE
-- Stores Shopify store data, access tokens, billing info, and sync state
-- ============================================================================
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT UNIQUE NOT NULL,
  shopify_shop_id TEXT UNIQUE NOT NULL,

  -- Encrypted access token (ISSUE #9: PBKDF2 + auth tags)
  access_token_encrypted TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  access_token_auth_tag TEXT NOT NULL,
  encryption_key_version INTEGER DEFAULT 1,

  -- Shop metadata
  shop_name TEXT,
  shop_email TEXT,
  shop_owner TEXT,
  shop_currency TEXT DEFAULT 'USD',
  shop_timezone TEXT,

  -- Billing fields (Phase 1 requirement)
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'professional', 'business', 'enterprise')),
  returns_quota INTEGER DEFAULT 5,
  returns_used_this_month INTEGER DEFAULT 0,
  billing_cycle_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  shopify_charge_id TEXT,

  -- Sync progress tracking (ISSUE #3: atomic updates)
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  sync_progress INTEGER DEFAULT 0 CHECK (sync_progress >= 0 AND sync_progress <= 100),
  sync_total_orders INTEGER DEFAULT 0,
  orders_synced_count INTEGER DEFAULT 0,
  last_sync_at TIMESTAMP WITH TIME ZONE,

  -- Resume sync (ISSUE #10: prevent duplicates)
  last_synced_order_id TEXT,

  -- Webhook version tracking (ISSUE #6: version expiry)
  webhook_api_version TEXT DEFAULT '2024-01',
  webhooks_registered BOOLEAN DEFAULT FALSE,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  uninstalled_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX idx_merchants_shop_domain ON merchants(shop_domain);
CREATE INDEX idx_merchants_is_active ON merchants(is_active);
CREATE INDEX idx_merchants_sync_status ON merchants(sync_status);

-- ============================================================================
-- CUSTOMERS TABLE
-- Stores Shopify customer data with aggregated stats
-- ============================================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  shopify_customer_id TEXT NOT NULL,

  -- Customer info
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,

  -- Address (stored as JSONB for flexibility)
  default_address JSONB,

  -- Aggregated stats (calculated from orders/returns)
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  total_returns INTEGER DEFAULT 0,
  return_rate DECIMAL(5, 2) DEFAULT 0, -- Percentage (0-100)

  -- Risk scoring (Phase 2 - populated by fraud detection engine)
  risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Shopify metadata
  accepts_marketing BOOLEAN DEFAULT FALSE,
  marketing_opt_in_level TEXT,
  tags TEXT[],
  note TEXT,

  -- Status
  status TEXT DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled', 'invited', 'declined')),

  -- Timestamps
  shopify_created_at TIMESTAMP WITH TIME ZONE,
  shopify_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one customer per merchant per shopify_customer_id
  UNIQUE(merchant_id, shopify_customer_id)
);

-- Indexes
CREATE INDEX idx_customers_merchant_id ON customers(merchant_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_return_rate ON customers(return_rate DESC);
CREATE INDEX idx_customers_risk_score ON customers(risk_score DESC);
CREATE INDEX idx_customers_shopify_customer_id ON customers(merchant_id, shopify_customer_id);

-- ============================================================================
-- ORDERS TABLE
-- Stores Shopify order data
-- ============================================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  shopify_order_id TEXT NOT NULL,

  -- Order details
  order_number TEXT NOT NULL,
  email TEXT,
  total_price DECIMAL(10, 2) NOT NULL,
  subtotal_price DECIMAL(10, 2),
  total_tax DECIMAL(10, 2),
  total_discounts DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',

  -- Line items (stored as JSONB)
  line_items JSONB NOT NULL DEFAULT '[]',

  -- Shipping
  shipping_address JSONB,
  billing_address JSONB,
  shipping_lines JSONB,

  -- Payment
  payment_gateway_names TEXT[],
  financial_status TEXT,

  -- Fulfillment
  fulfillment_status TEXT,
  fulfilled_at TIMESTAMP WITH TIME ZONE,

  -- Order metadata
  tags TEXT[],
  note TEXT,
  source_name TEXT,

  -- Cancellation
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancel_reason TEXT,

  -- Timestamps
  shopify_created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  shopify_updated_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(merchant_id, shopify_order_id)
);

-- Indexes
CREATE INDEX idx_orders_merchant_id ON orders(merchant_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_shopify_order_id ON orders(merchant_id, shopify_order_id);
CREATE INDEX idx_orders_shopify_created_at ON orders(shopify_created_at DESC);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- ============================================================================
-- RETURNS TABLE
-- Stores refund data (from Shopify Refunds API and future integrations)
-- Includes 'source' field to track data origin (ISSUE: returns data source)
-- ============================================================================
CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  shopify_return_id TEXT NOT NULL,

  -- Return metadata
  return_reason TEXT,
  return_value DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Returned items (stored as JSONB)
  items_returned JSONB NOT NULL DEFAULT '[]',

  -- Data source tracking (allows multiple return data sources)
  source TEXT NOT NULL DEFAULT 'shopify_refund' CHECK (
    source IN ('shopify_refund', 'loop_returns', 'aftership_returns', 'manual')
  ),

  -- Return status
  return_status TEXT DEFAULT 'completed' CHECK (
    return_status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')
  ),

  -- Fraud signals (populated by fraud detection - Phase 2)
  is_fraudulent BOOLEAN DEFAULT FALSE,
  fraud_confidence DECIMAL(5, 2), -- 0-100 confidence score
  fraud_reasons TEXT[],

  -- Shopify refund metadata
  restock BOOLEAN DEFAULT TRUE,
  note TEXT,

  -- Timestamps
  shopify_created_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint per source
  UNIQUE(merchant_id, shopify_return_id, source)
);

-- Indexes
CREATE INDEX idx_returns_merchant_id ON returns(merchant_id);
CREATE INDEX idx_returns_customer_id ON returns(customer_id);
CREATE INDEX idx_returns_order_id ON returns(order_id);
CREATE INDEX idx_returns_shopify_created_at ON returns(shopify_created_at DESC);
CREATE INDEX idx_returns_source ON returns(source);
CREATE INDEX idx_returns_is_fraudulent ON returns(is_fraudulent);

-- ============================================================================
-- FRAUD_SIGNALS TABLE
-- Stores individual fraud indicators (Phase 2)
-- ============================================================================
CREATE TABLE fraud_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  return_id UUID REFERENCES returns(id) ON DELETE CASCADE,

  -- Signal details
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'high_frequency',
    'value_discrepancy',
    'item_mismatch',
    'address_mismatch',
    'velocity_spike',
    'duplicate_claim',
    'behavioral_anomaly'
  )),
  signal_weight DECIMAL(5, 2) NOT NULL, -- Contribution to overall fraud score
  signal_data JSONB, -- Additional context

  -- Timestamps
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_fraud_signals_merchant_id ON fraud_signals(merchant_id);
CREATE INDEX idx_fraud_signals_customer_id ON fraud_signals(customer_id);
CREATE INDEX idx_fraud_signals_return_id ON fraud_signals(return_id);
CREATE INDEX idx_fraud_signals_signal_type ON fraud_signals(signal_type);

-- ============================================================================
-- BACKGROUND_JOBS TABLE
-- Stores async tasks for webhook registration and sync (ISSUE #1)
-- ============================================================================
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Job details
  job_type TEXT NOT NULL CHECK (job_type IN ('register-webhooks', 'initial-sync', 'reregister-webhooks')),
  payload JSONB,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX idx_background_jobs_merchant_id ON background_jobs(merchant_id);
CREATE INDEX idx_background_jobs_status ON background_jobs(status);
CREATE INDEX idx_background_jobs_job_type ON background_jobs(job_type);
CREATE INDEX idx_background_jobs_next_retry ON background_jobs(next_retry_at) WHERE status = 'failed';

-- ============================================================================
-- ATOMIC FUNCTIONS (ISSUE #3: prevent race conditions)
-- ============================================================================

-- Function to atomically increment sync progress
CREATE OR REPLACE FUNCTION increment_sync_progress(
  p_merchant_id UUID,
  p_orders_synced INT
) RETURNS VOID AS $$
BEGIN
  UPDATE merchants
  SET
    orders_synced_count = orders_synced_count + p_orders_synced,
    sync_progress = LEAST(
      100,
      CAST(
        ((orders_synced_count + p_orders_synced) * 100.0 / NULLIF(sync_total_orders, 0))
        AS INTEGER
      )
    ),
    updated_at = NOW()
  WHERE id = p_merchant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to atomically increment returns usage
CREATE OR REPLACE FUNCTION increment_returns_usage(
  p_merchant_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE merchants
  SET
    returns_used_this_month = returns_used_this_month + 1,
    updated_at = NOW()
  WHERE id = p_merchant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check if merchant is over quota
CREATE OR REPLACE FUNCTION is_over_quota(
  p_merchant_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_plan TEXT;
  v_used INTEGER;
  v_quota INTEGER;
BEGIN
  SELECT plan, returns_used_this_month, returns_quota
  INTO v_plan, v_used, v_quota
  FROM merchants
  WHERE id = p_merchant_id;

  -- Enterprise plan has unlimited quota
  IF v_plan = 'enterprise' THEN
    RETURN FALSE;
  END IF;

  -- Check if used >= quota
  RETURN v_used >= v_quota;
END;
$$ LANGUAGE plpgsql;

-- Function to reset monthly usage (call via cron job)
CREATE OR REPLACE FUNCTION reset_monthly_usage() RETURNS VOID AS $$
BEGIN
  UPDATE merchants
  SET
    returns_used_this_month = 0,
    billing_cycle_start = NOW(),
    updated_at = NOW()
  WHERE billing_cycle_start < NOW() - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- Automatically update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (Optional - can enable for additional security)
-- Disabled by default for service role access
-- ============================================================================

-- Enable RLS on all tables (commented out - enable if needed)
-- ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fraud_signals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

-- Example policy (merchants can only access their own data)
-- CREATE POLICY merchant_isolation ON customers
--   FOR ALL
--   USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

-- ============================================================================
-- INITIAL DATA (Optional test data)
-- ============================================================================

-- Insert sample billing plans metadata (for reference)
CREATE TABLE IF NOT EXISTS billing_plans (
  plan_name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  price_monthly DECIMAL(10, 2) NOT NULL,
  returns_quota INTEGER NOT NULL,
  features JSONB
);

INSERT INTO billing_plans (plan_name, display_name, price_monthly, returns_quota, features) VALUES
  ('free', 'Free', 0, 5, '{"fraud_detection": false, "advanced_analytics": false}'::jsonb),
  ('professional', 'Professional', 79, 100, '{"fraud_detection": true, "advanced_analytics": false}'::jsonb),
  ('business', 'Business', 149, 500, '{"fraud_detection": true, "advanced_analytics": true}'::jsonb),
  ('enterprise', 'Enterprise', 299, -1, '{"fraud_detection": true, "advanced_analytics": true, "custom_integrations": true}'::jsonb);

-- ============================================================================
-- INDEXES FOR TIMELINE QUERY (ISSUE #4: performance optimization)
-- ============================================================================

-- Composite index for efficient timeline queries
CREATE INDEX idx_orders_timeline ON orders(customer_id, shopify_created_at DESC);
CREATE INDEX idx_returns_timeline ON returns(customer_id, shopify_created_at DESC);

-- ============================================================================
-- VIEWS (Optional - for easier querying)
-- ============================================================================

-- View: Customer timeline (orders + returns combined)
CREATE OR REPLACE VIEW customer_timeline AS
SELECT
  o.customer_id,
  'order' AS event_type,
  o.shopify_order_id AS event_id,
  o.order_number AS reference,
  o.total_price AS amount,
  o.currency,
  o.shopify_created_at AS event_date,
  o.line_items AS details,
  o.id AS order_id,
  NULL::UUID AS return_id
FROM orders o
UNION ALL
SELECT
  r.customer_id,
  'return' AS event_type,
  r.shopify_return_id AS event_id,
  (SELECT order_number FROM orders WHERE id = r.order_id) AS reference,
  r.return_value AS amount,
  r.currency,
  r.shopify_created_at AS event_date,
  r.items_returned AS details,
  r.order_id,
  r.id AS return_id
FROM returns r
ORDER BY event_date DESC;

-- View: Merchant stats summary
CREATE OR REPLACE VIEW merchant_stats AS
SELECT
  m.id AS merchant_id,
  m.shop_domain,
  m.plan,
  m.returns_used_this_month,
  m.returns_quota,
  COUNT(DISTINCT c.id) AS total_customers,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT r.id) AS total_returns,
  COALESCE(SUM(o.total_price), 0) AS total_revenue,
  COALESCE(SUM(r.return_value), 0) AS total_refunded,
  CASE
    WHEN COUNT(DISTINCT o.id) > 0
    THEN CAST(COUNT(DISTINCT r.id) * 100.0 / COUNT(DISTINCT o.id) AS DECIMAL(5,2))
    ELSE 0
  END AS overall_return_rate
FROM merchants m
LEFT JOIN customers c ON c.merchant_id = m.id
LEFT JOIN orders o ON o.merchant_id = m.id
LEFT JOIN returns r ON r.merchant_id = m.id
WHERE m.is_active = TRUE
GROUP BY m.id, m.shop_domain, m.plan, m.returns_used_this_month, m.returns_quota;

-- ============================================================================
-- COMMENTS (Documentation for developers)
-- ============================================================================

COMMENT ON TABLE merchants IS 'Stores Shopify merchant data, encrypted access tokens, billing info, and sync state';
COMMENT ON TABLE customers IS 'Shopify customers with aggregated order/return stats and risk scores';
COMMENT ON TABLE orders IS 'Historical Shopify orders with line items and metadata';
COMMENT ON TABLE returns IS 'Refunds from Shopify and third-party return apps, with fraud detection flags';
COMMENT ON TABLE fraud_signals IS 'Individual fraud indicators for return risk assessment (Phase 2)';
COMMENT ON TABLE background_jobs IS 'Async task queue for webhook registration and data sync operations';
COMMENT ON TABLE billing_plans IS 'Reference table for subscription plan metadata';

COMMENT ON COLUMN merchants.access_token_encrypted IS 'AES-256-GCM encrypted Shopify access token (PBKDF2 derived key)';
COMMENT ON COLUMN merchants.last_synced_order_id IS 'Resume point for incremental sync (prevents duplicates on retry)';
COMMENT ON COLUMN merchants.webhook_api_version IS 'Tracks registered webhook API version for automatic re-registration';
COMMENT ON COLUMN returns.source IS 'Data source: shopify_refund, loop_returns, aftership_returns, etc.';
COMMENT ON FUNCTION increment_sync_progress IS 'Atomically updates sync progress counter (prevents race conditions)';

-- ============================================================================
-- GRANT PERMISSIONS (if using service role)
-- ============================================================================

-- Grant all permissions to service role (Supabase default)
-- Already handled by Supabase - no need to explicitly grant

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('merchants', 'customers', 'orders', 'returns', 'fraud_signals', 'background_jobs', 'billing_plans');

  IF table_count = 7 THEN
    RAISE NOTICE 'SUCCESS: All 7 tables created successfully';
  ELSE
    RAISE EXCEPTION 'ERROR: Expected 7 tables, found %', table_count;
  END IF;
END $$;
