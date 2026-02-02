-- ReturnGuard Phase 1 - Fraud Intelligence Foundation
-- Critical additions for future cross-merchant fraud detection (Phase 3)

-- ============================================================================
-- FRAUD INTELLIGENCE TABLE
-- Shared fraud intelligence across merchants (foundation for Phase 3)
-- ============================================================================
CREATE TABLE fraud_intelligence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('email', 'ip_address', 'phone', 'device', 'billing_address')),
  entity_hash TEXT NOT NULL UNIQUE,
  fraud_score INTEGER DEFAULT 0 CHECK (fraud_score >= 0 AND fraud_score <= 100),
  total_appearances INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_returns INTEGER DEFAULT 0,
  total_chargebacks INTEGER DEFAULT 0,
  return_rate DECIMAL(5,2) DEFAULT 0,
  chargeback_rate DECIMAL(5,2) DEFAULT 0,
  merchant_count INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  is_confirmed_fraud BOOLEAN DEFAULT false,
  fraud_patterns JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fraud intelligence
CREATE INDEX idx_fraud_intelligence_hash ON fraud_intelligence(entity_hash);
CREATE INDEX idx_fraud_intelligence_score ON fraud_intelligence(fraud_score DESC);
CREATE INDEX idx_fraud_intelligence_type ON fraud_intelligence(entity_type);
CREATE INDEX idx_fraud_intelligence_confirmed ON fraud_intelligence(is_confirmed_fraud) WHERE is_confirmed_fraud = true;

COMMENT ON TABLE fraud_intelligence IS 'Cross-merchant fraud intelligence - aggregates patterns across all merchants who opt in';
COMMENT ON COLUMN fraud_intelligence.entity_hash IS 'SHA-256 hash of entity value (email, IP, phone, etc.) for privacy';
COMMENT ON COLUMN fraud_intelligence.merchant_count IS 'Number of unique merchants who have seen this entity';

-- ============================================================================
-- MERCHANT DATA SHARING CONSENT
-- Add to merchants table
-- ============================================================================
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS data_sharing_enabled BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS data_sharing_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN merchants.data_sharing_enabled IS 'Whether merchant opts in to cross-merchant fraud intelligence sharing';
COMMENT ON COLUMN merchants.data_sharing_consent_at IS 'Timestamp when merchant gave consent for data sharing';

-- ============================================================================
-- CUSTOMER HASHED IDENTIFIERS
-- Add to customers table for cross-store matching (Phase 3)
-- ============================================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_hash TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_hash TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_address_hash TEXT;

CREATE INDEX idx_customers_email_hash ON customers(email_hash);
CREATE INDEX idx_customers_phone_hash ON customers(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX idx_customers_billing_address_hash ON customers(billing_address_hash) WHERE billing_address_hash IS NOT NULL;

COMMENT ON COLUMN customers.email_hash IS 'SHA-256 hash of lowercase email for cross-merchant fraud detection';
COMMENT ON COLUMN customers.phone_hash IS 'SHA-256 hash of normalized phone for cross-merchant fraud detection';
COMMENT ON COLUMN customers.billing_address_hash IS 'SHA-256 hash of normalized billing address for fraud detection';

-- ============================================================================
-- MERCHANT FRAUD POLICIES
-- Automated actions based on risk scores
-- ============================================================================
CREATE TABLE merchant_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('auto_approve', 'flag_review', 'auto_block')),
  min_risk_score INTEGER NOT NULL CHECK (min_risk_score >= 0 AND min_risk_score <= 100),
  max_risk_score INTEGER NOT NULL CHECK (max_risk_score >= 0 AND max_risk_score <= 100),
  actions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, policy_type),
  CHECK (min_risk_score <= max_risk_score)
);

CREATE INDEX idx_merchant_policies_merchant ON merchant_policies(merchant_id);
CREATE INDEX idx_merchant_policies_active ON merchant_policies(merchant_id, is_active) WHERE is_active = true;

COMMENT ON TABLE merchant_policies IS 'Automated fraud policies - define actions based on risk score thresholds';
COMMENT ON COLUMN merchant_policies.actions IS 'JSON config: {"send_email": true, "block_return": false, "require_receipt": true}';

-- Insert default policies for new merchants
CREATE OR REPLACE FUNCTION create_default_policies()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-approve low risk (0-25)
  INSERT INTO merchant_policies (merchant_id, policy_type, min_risk_score, max_risk_score, actions)
  VALUES (
    NEW.id,
    'auto_approve',
    0,
    25,
    '{"send_email": false, "block_return": false}'::jsonb
  );

  -- Flag for review medium risk (26-75)
  INSERT INTO merchant_policies (merchant_id, policy_type, min_risk_score, max_risk_score, actions)
  VALUES (
    NEW.id,
    'flag_review',
    26,
    75,
    '{"send_email": true, "require_receipt": true, "block_return": false}'::jsonb
  );

  -- Auto-block high risk (76-100)
  INSERT INTO merchant_policies (merchant_id, policy_type, min_risk_score, max_risk_score, actions)
  VALUES (
    NEW.id,
    'auto_block',
    76,
    100,
    '{"send_email": true, "block_return": true, "alert_severity": "critical"}'::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_policies
AFTER INSERT ON merchants
FOR EACH ROW EXECUTE FUNCTION create_default_policies();

-- ============================================================================
-- FRAUD ALERTS / NOTIFICATIONS
-- Real-time alerts for merchants about high-risk activity
-- ============================================================================
CREATE TABLE fraud_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  return_id UUID REFERENCES returns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('high_risk_return', 'serial_returner', 'cross_store_fraud', 'quota_exceeded', 'policy_violation', 'velocity_spike')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  is_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fraud_alerts_merchant ON fraud_alerts(merchant_id, created_at DESC);
CREATE INDEX idx_fraud_alerts_unread ON fraud_alerts(merchant_id, is_read) WHERE is_read = false;
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(merchant_id, severity, created_at DESC);
CREATE INDEX idx_fraud_alerts_type ON fraud_alerts(merchant_id, alert_type);

COMMENT ON TABLE fraud_alerts IS 'Real-time fraud alerts and notifications for merchants';
COMMENT ON COLUMN fraud_alerts.metadata IS 'Additional context: {"risk_score": 85, "reason": "High velocity", "customer_email": "..."}';

-- ============================================================================
-- FRAUD INTELLIGENCE UPDATE FUNCTION
-- Called after each order/return to update cross-merchant intelligence
-- ============================================================================
CREATE OR REPLACE FUNCTION update_fraud_intelligence(
  p_entity_type TEXT,
  p_entity_hash TEXT,
  p_is_return BOOLEAN,
  p_merchant_id UUID
) RETURNS VOID AS $$
DECLARE
  v_merchant_sharing BOOLEAN;
BEGIN
  -- Check if merchant has data sharing enabled
  SELECT data_sharing_enabled INTO v_merchant_sharing
  FROM merchants WHERE id = p_merchant_id;

  -- Only update fraud intelligence if merchant opted in
  IF v_merchant_sharing THEN
    INSERT INTO fraud_intelligence (
      entity_type,
      entity_hash,
      total_orders,
      total_returns,
      total_appearances,
      merchant_count
    )
    VALUES (
      p_entity_type,
      p_entity_hash,
      1,
      CASE WHEN p_is_return THEN 1 ELSE 0 END,
      1,
      1
    )
    ON CONFLICT (entity_hash) DO UPDATE SET
      total_orders = fraud_intelligence.total_orders + 1,
      total_returns = fraud_intelligence.total_returns + CASE WHEN p_is_return THEN 1 ELSE 0 END,
      total_appearances = fraud_intelligence.total_appearances + 1,
      return_rate = ((fraud_intelligence.total_returns + CASE WHEN p_is_return THEN 1 ELSE 0 END)::DECIMAL /
                     NULLIF(fraud_intelligence.total_orders + 1, 0)) * 100,
      last_seen_at = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_fraud_intelligence IS 'Updates cross-merchant fraud intelligence (only for merchants who opted in)';

-- ============================================================================
-- CUSTOMER HASH CALCULATION TRIGGER
-- Automatically calculate hashes when customer is created/updated
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_customer_hashes()
RETURNS TRIGGER AS $$
BEGIN
  -- Hash email (lowercase for consistency)
  IF NEW.email IS NOT NULL THEN
    NEW.email_hash = encode(digest(lower(NEW.email) || 'RETURNGAURD_SALT_V1', 'sha256'), 'hex');
  END IF;

  -- Hash phone (normalized - digits only)
  IF NEW.phone IS NOT NULL THEN
    NEW.phone_hash = encode(digest(regexp_replace(NEW.phone, '[^0-9]', '', 'g') || 'RETURNGAURD_SALT_V1', 'sha256'), 'hex');
  END IF;

  -- Hash billing address (normalized)
  IF NEW.default_address IS NOT NULL THEN
    -- Concatenate address components, lowercase, remove spaces
    DECLARE
      v_address_string TEXT;
    BEGIN
      v_address_string := COALESCE(lower(NEW.default_address->>'address1'), '') ||
                         COALESCE(lower(NEW.default_address->>'city'), '') ||
                         COALESCE(lower(NEW.default_address->>'province_code'), '') ||
                         COALESCE(lower(NEW.default_address->>'zip'), '') ||
                         COALESCE(lower(NEW.default_address->>'country_code'), '');
      v_address_string := regexp_replace(v_address_string, '\s+', '', 'g');

      NEW.billing_address_hash = encode(digest(v_address_string || 'RETURNGAURD_SALT_V1', 'sha256'), 'hex');
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_customer_hashes
BEFORE INSERT OR UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION calculate_customer_hashes();

COMMENT ON FUNCTION calculate_customer_hashes IS 'Auto-generates privacy-preserving hashes for cross-merchant fraud detection';

-- ============================================================================
-- FRAUD ALERT CREATION HELPER
-- Utility function to create fraud alerts
-- ============================================================================
CREATE OR REPLACE FUNCTION create_fraud_alert(
  p_merchant_id UUID,
  p_return_id UUID,
  p_customer_id UUID,
  p_alert_type TEXT,
  p_severity TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO fraud_alerts (
    merchant_id,
    return_id,
    customer_id,
    alert_type,
    severity,
    message,
    metadata
  )
  VALUES (
    p_merchant_id,
    p_return_id,
    p_customer_id,
    p_alert_type,
    p_severity,
    p_message,
    p_metadata
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_fraud_alert IS 'Helper function to create fraud alerts with proper validation';

-- ============================================================================
-- FRAUD INTELLIGENCE LOOKUP FUNCTION
-- Query cross-merchant fraud intelligence for an entity
-- ============================================================================
CREATE OR REPLACE FUNCTION get_fraud_intelligence(
  p_entity_type TEXT,
  p_entity_value TEXT
) RETURNS TABLE (
  fraud_score INTEGER,
  total_appearances INTEGER,
  total_returns INTEGER,
  return_rate DECIMAL,
  merchant_count INTEGER,
  is_confirmed_fraud BOOLEAN
) AS $$
DECLARE
  v_hash TEXT;
BEGIN
  -- Calculate hash
  v_hash := encode(digest(lower(p_entity_value) || 'RETURNGAURD_SALT_V1', 'sha256'), 'hex');

  -- Return fraud intelligence if exists
  RETURN QUERY
  SELECT
    fi.fraud_score,
    fi.total_appearances,
    fi.total_returns,
    fi.return_rate,
    fi.merchant_count,
    fi.is_confirmed_fraud
  FROM fraud_intelligence fi
  WHERE fi.entity_hash = v_hash
    AND fi.entity_type = p_entity_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_fraud_intelligence IS 'Looks up cross-merchant fraud intelligence for an email, phone, IP, etc.';

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- Merchant alert summary view
CREATE OR REPLACE VIEW merchant_alert_summary AS
SELECT
  m.id AS merchant_id,
  m.shop_domain,
  COUNT(fa.id) AS total_alerts,
  COUNT(fa.id) FILTER (WHERE fa.is_read = false) AS unread_alerts,
  COUNT(fa.id) FILTER (WHERE fa.severity = 'critical') AS critical_alerts,
  COUNT(fa.id) FILTER (WHERE fa.severity = 'high') AS high_alerts,
  COUNT(fa.id) FILTER (WHERE fa.created_at > NOW() - INTERVAL '24 hours') AS alerts_last_24h,
  MAX(fa.created_at) AS last_alert_at
FROM merchants m
LEFT JOIN fraud_alerts fa ON fa.merchant_id = m.id
WHERE m.is_active = TRUE
GROUP BY m.id, m.shop_domain;

COMMENT ON VIEW merchant_alert_summary IS 'Summary of fraud alerts per merchant';

-- Top risky entities view (for admin dashboard - Phase 3)
CREATE OR REPLACE VIEW top_risky_entities AS
SELECT
  entity_type,
  entity_hash,
  fraud_score,
  total_returns,
  total_orders,
  return_rate,
  merchant_count,
  is_confirmed_fraud
FROM fraud_intelligence
WHERE fraud_score >= 50
  OR is_confirmed_fraud = true
ORDER BY fraud_score DESC, total_returns DESC
LIMIT 1000;

COMMENT ON VIEW top_risky_entities IS 'Top 1000 risky entities across all merchants (admin view)';

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_fraud_intelligence_updated_at
BEFORE UPDATE ON fraud_intelligence
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_merchant_policies_updated_at
BEFORE UPDATE ON merchant_policies
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANTS (if using RLS)
-- ============================================================================
-- Merchants can only see their own policies and alerts
-- ALTER TABLE merchant_policies ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY merchant_policies_isolation ON merchant_policies
--   FOR ALL
--   USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

-- CREATE POLICY fraud_alerts_isolation ON fraud_alerts
--   FOR ALL
--   USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

-- Fraud intelligence is read-only for individual merchants
-- ALTER TABLE fraud_intelligence ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY fraud_intelligence_read_only ON fraud_intelligence
--   FOR SELECT
--   USING (true); -- All merchants can read (for lookups)

-- Only system can write to fraud_intelligence
-- CREATE POLICY fraud_intelligence_system_write ON fraud_intelligence
--   FOR INSERT
--   USING (current_user = 'service_role');

-- ============================================================================
-- DATA SEEDING (Optional - for testing)
-- ============================================================================

-- Example: Seed some test fraud patterns
-- INSERT INTO fraud_intelligence (entity_type, entity_hash, fraud_score, total_orders, total_returns, return_rate, merchant_count, is_confirmed_fraud)
-- VALUES
--   ('email', encode(digest('test@fraud.com' || 'RETURNGAURD_SALT_V1', 'sha256'), 'hex'), 95, 50, 48, 96.0, 5, true),
--   ('email', encode(digest('suspicious@returns.com' || 'RETURNGAURD_SALT_V1', 'sha256'), 'hex'), 75, 30, 25, 83.3, 3, false);

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('fraud_intelligence', 'merchant_policies', 'fraud_alerts');

  IF table_count = 3 THEN
    RAISE NOTICE 'SUCCESS: Fraud intelligence foundation tables created (3/3)';
  ELSE
    RAISE EXCEPTION 'ERROR: Expected 3 fraud tables, found %', table_count;
  END IF;

  -- Verify columns added to merchants
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'merchants'
    AND column_name = 'data_sharing_enabled'
  ) THEN
    RAISE NOTICE 'SUCCESS: Merchant data sharing columns added';
  ELSE
    RAISE EXCEPTION 'ERROR: Merchant data sharing columns not found';
  END IF;

  -- Verify columns added to customers
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers'
    AND column_name IN ('email_hash', 'phone_hash', 'billing_address_hash')
  ) THEN
    RAISE NOTICE 'SUCCESS: Customer hash columns added';
  ELSE
    RAISE EXCEPTION 'ERROR: Customer hash columns not found';
  END IF;

  RAISE NOTICE 'Migration 002 completed successfully!';
END $$;
