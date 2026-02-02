/**
 * Row Level Security (RLS) Policies
 * Phase 3: Enforce data isolation between merchants
 *
 * CRITICAL: Ensures merchants can only access their own data
 */

-- Enable RLS on all sensitive tables
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MERCHANTS TABLE POLICIES
-- ============================================================================

-- Merchants: Only see their own data
CREATE POLICY merchant_isolation ON merchants
  FOR ALL
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- Service role bypass (for server-side operations)
CREATE POLICY merchant_service_role_bypass ON merchants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- CUSTOMERS TABLE POLICIES
-- ============================================================================

-- Customers: Only see customers from their own merchant
CREATE POLICY customer_isolation ON customers
  FOR ALL
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  );

-- Service role bypass
CREATE POLICY customer_service_role_bypass ON customers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ORDERS TABLE POLICIES
-- ============================================================================

-- Orders: Only see orders from their own merchant
CREATE POLICY order_isolation ON orders
  FOR ALL
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  );

-- Service role bypass
CREATE POLICY order_service_role_bypass ON orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RETURNS TABLE POLICIES
-- ============================================================================

-- Returns: Only see returns from their own merchant
CREATE POLICY return_isolation ON returns
  FOR ALL
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  );

-- Service role bypass
CREATE POLICY return_service_role_bypass ON returns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FRAUD_ALERTS TABLE POLICIES
-- ============================================================================

-- Fraud Alerts: Only see alerts from their own merchant
CREATE POLICY fraud_alert_isolation ON fraud_alerts
  FOR ALL
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
  );

-- Service role bypass
CREATE POLICY fraud_alert_service_role_bypass ON fraud_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FRAUD_INTELLIGENCE TABLE POLICIES
-- ============================================================================

-- Fraud Intelligence: READ-ONLY, aggregated data only (no PII)
-- Merchants can read fraud intelligence but cannot write directly
CREATE POLICY fraud_intelligence_read_only ON fraud_intelligence
  FOR SELECT
  USING (true); -- All authenticated users can read (it's anonymized)

-- Fraud Intelligence: NO direct writes from clients
CREATE POLICY fraud_intelligence_no_write ON fraud_intelligence
  FOR INSERT
  WITH CHECK (false); -- Only database functions can write

CREATE POLICY fraud_intelligence_no_update ON fraud_intelligence
  FOR UPDATE
  USING (false);

CREATE POLICY fraud_intelligence_no_delete ON fraud_intelligence
  FOR DELETE
  USING (false);

-- Service role can write (for server-side functions only)
CREATE POLICY fraud_intelligence_service_role_bypass ON fraud_intelligence
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SECURITY_AUDIT_LOGS TABLE POLICIES
-- ============================================================================

-- Enable RLS on audit logs (if not already enabled)
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs: Merchants can only read their own logs
CREATE POLICY audit_log_read_isolation ON security_audit_logs
  FOR SELECT
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
    OR merchant_id IS NULL -- Allow reading global logs
  );

-- Audit logs: No direct writes from clients
CREATE POLICY audit_log_no_write ON security_audit_logs
  FOR INSERT
  WITH CHECK (false);

-- Service role bypass
CREATE POLICY audit_log_service_role_bypass ON security_audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SECURITY_INCIDENTS TABLE POLICIES
-- ============================================================================

-- Enable RLS on security incidents
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;

-- Security Incidents: Merchants can only read their own incidents
CREATE POLICY security_incident_read_isolation ON security_incidents
  FOR SELECT
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE auth.uid()::text = id::text
    )
    OR merchant_id IS NULL
  );

-- Security Incidents: No direct writes from clients
CREATE POLICY security_incident_no_write ON security_incidents
  FOR INSERT
  WITH CHECK (false);

-- Service role bypass
CREATE POLICY security_incident_service_role_bypass ON security_incidents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY merchant_isolation ON merchants IS 'Merchants can only access their own data';
COMMENT ON POLICY customer_isolation ON customers IS 'Customers are isolated by merchant';
COMMENT ON POLICY order_isolation ON orders IS 'Orders are isolated by merchant';
COMMENT ON POLICY return_isolation ON returns IS 'Returns are isolated by merchant';
COMMENT ON POLICY fraud_alert_isolation ON fraud_alerts IS 'Fraud alerts are isolated by merchant';
COMMENT ON POLICY fraud_intelligence_read_only ON fraud_intelligence IS 'Fraud intelligence is read-only, anonymized data';
