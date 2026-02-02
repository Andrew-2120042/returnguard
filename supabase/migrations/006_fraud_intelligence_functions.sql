/**
 * Fraud Intelligence Database Functions
 * Phase 3: Cross-store fraud intelligence queries
 *
 * These functions provide secure access to aggregated fraud data
 */

-- ============================================================================
-- Get fraud intelligence statistics for network dashboard
-- ============================================================================
CREATE OR REPLACE FUNCTION get_fraud_intelligence_stats()
RETURNS TABLE (
  total_merchants BIGINT,
  total_records BIGINT,
  high_risk_entities BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(DISTINCT id) FROM merchants WHERE data_sharing_enabled = true) as total_merchants,
    (SELECT COUNT(*) FROM fraud_intelligence) as total_records,
    (SELECT COUNT(*) FROM fraud_intelligence WHERE fraud_score >= 70 AND merchant_count >= 3) as high_risk_entities;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_fraud_intelligence_stats IS 'Returns network-wide fraud intelligence statistics';

-- ============================================================================
-- Query fraud intelligence for a specific entity
-- ============================================================================

-- Drop existing function if it exists (from migration 002)
DROP FUNCTION IF EXISTS get_fraud_intelligence(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_fraud_intelligence(
  p_entity_type TEXT,
  p_entity_hash TEXT
) RETURNS TABLE (
  fraud_score INTEGER,
  return_rate DECIMAL,
  merchant_count INTEGER,
  total_orders INTEGER,
  total_returns INTEGER,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fi.fraud_score,
    fi.return_rate,
    fi.merchant_count,
    fi.total_orders,
    fi.total_returns,
    fi.first_seen_at,
    fi.last_seen_at
  FROM fraud_intelligence fi
  WHERE fi.entity_type = p_entity_type
    AND fi.entity_hash = p_entity_hash
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_fraud_intelligence IS 'Queries fraud intelligence for a specific entity (email, IP, phone)';

-- ============================================================================
-- Update fraud intelligence securely (called by server-side only)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_fraud_intelligence_secure(
  p_entity_type TEXT,
  p_entity_hash TEXT,
  p_is_return BOOLEAN,
  p_merchant_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_merchant_data_sharing BOOLEAN;
  v_existing_record RECORD;
  v_new_merchant_count INTEGER;
BEGIN
  -- 1. Verify merchant has data sharing enabled
  SELECT data_sharing_enabled INTO v_merchant_data_sharing
  FROM merchants
  WHERE id = p_merchant_id;

  IF NOT FOUND OR v_merchant_data_sharing = FALSE THEN
    -- Merchant not found or data sharing disabled - silently skip
    RETURN FALSE;
  END IF;

  -- 2. Check if record exists
  SELECT * INTO v_existing_record
  FROM fraud_intelligence
  WHERE entity_type = p_entity_type
    AND entity_hash = p_entity_hash;

  IF FOUND THEN
    -- 3. Update existing record
    
    -- Check if this merchant is new to this entity
    IF NOT EXISTS (
      SELECT 1 FROM fraud_intelligence_merchant_tracking
      WHERE entity_type = p_entity_type
        AND entity_hash = p_entity_hash
        AND merchant_id = p_merchant_id
    ) THEN
      -- New merchant for this entity
      v_new_merchant_count := v_existing_record.merchant_count + 1;
      
      -- Track this merchant
      INSERT INTO fraud_intelligence_merchant_tracking (
        entity_type,
        entity_hash,
        merchant_id,
        first_seen_at
      ) VALUES (
        p_entity_type,
        p_entity_hash,
        p_merchant_id,
        NOW()
      );
    ELSE
      -- Existing merchant
      v_new_merchant_count := v_existing_record.merchant_count;
    END IF;

    -- Update the fraud intelligence record
    UPDATE fraud_intelligence
    SET
      total_orders = total_orders + 1,
      total_returns = total_returns + (CASE WHEN p_is_return THEN 1 ELSE 0 END),
      return_rate = ROUND(
        ((total_returns + (CASE WHEN p_is_return THEN 1 ELSE 0 END))::DECIMAL / 
         (total_orders + 1)::DECIMAL) * 100,
        2
      ),
      merchant_count = v_new_merchant_count,
      fraud_score = LEAST(100, GREATEST(0, 
        -- Calculate fraud score based on return rate and merchant count
        (v_new_merchant_count * 5) + 
        (CASE 
          WHEN ((total_returns + (CASE WHEN p_is_return THEN 1 ELSE 0 END))::DECIMAL / (total_orders + 1)::DECIMAL) > 0.7 THEN 30
          WHEN ((total_returns + (CASE WHEN p_is_return THEN 1 ELSE 0 END))::DECIMAL / (total_orders + 1)::DECIMAL) > 0.5 THEN 20
          WHEN ((total_returns + (CASE WHEN p_is_return THEN 1 ELSE 0 END))::DECIMAL / (total_orders + 1)::DECIMAL) > 0.3 THEN 10
          ELSE 0
        END)
      )),
      last_seen_at = NOW(),
      updated_at = NOW()
    WHERE entity_type = p_entity_type
      AND entity_hash = p_entity_hash;

  ELSE
    -- 4. Create new record
    INSERT INTO fraud_intelligence (
      entity_type,
      entity_hash,
      fraud_score,
      return_rate,
      merchant_count,
      total_orders,
      total_returns,
      first_seen_at,
      last_seen_at
    ) VALUES (
      p_entity_type,
      p_entity_hash,
      (CASE WHEN p_is_return THEN 50 ELSE 0 END), -- Initial score
      (CASE WHEN p_is_return THEN 100.0 ELSE 0.0 END),
      1,
      1,
      (CASE WHEN p_is_return THEN 1 ELSE 0 END),
      NOW(),
      NOW()
    );

    -- Track merchant
    INSERT INTO fraud_intelligence_merchant_tracking (
      entity_type,
      entity_hash,
      merchant_id,
      first_seen_at
    ) VALUES (
      p_entity_type,
      p_entity_hash,
      p_merchant_id,
      NOW()
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_fraud_intelligence_secure IS 'Securely updates fraud intelligence (server-side only)';

-- ============================================================================
-- Create merchant tracking table for fraud intelligence
-- ============================================================================
CREATE TABLE IF NOT EXISTS fraud_intelligence_merchant_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_hash TEXT NOT NULL,
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, entity_hash, merchant_id)
);

CREATE INDEX idx_fi_merchant_tracking_entity ON fraud_intelligence_merchant_tracking(entity_type, entity_hash);
CREATE INDEX idx_fi_merchant_tracking_merchant ON fraud_intelligence_merchant_tracking(merchant_id);

COMMENT ON TABLE fraud_intelligence_merchant_tracking IS 'Tracks which merchants have flagged which entities';

-- ============================================================================
-- Get top fraudsters (high risk entities)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_top_fraudsters(
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  entity_type TEXT,
  entity_hash TEXT,
  fraud_score INTEGER,
  return_rate DECIMAL,
  merchant_count INTEGER,
  total_orders INTEGER,
  total_returns INTEGER,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fi.entity_type,
    fi.entity_hash,
    fi.fraud_score,
    fi.return_rate,
    fi.merchant_count,
    fi.total_orders,
    fi.total_returns,
    fi.first_seen_at,
    fi.last_seen_at
  FROM fraud_intelligence fi
  WHERE fi.fraud_score >= 70
    AND fi.merchant_count >= 3
  ORDER BY fi.fraud_score DESC, fi.merchant_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_top_fraudsters IS 'Returns top fraudsters flagged by multiple stores';

-- ============================================================================
-- Get fraud intelligence for merchant's customers (batch query)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_fraud_intelligence_batch(
  p_entity_hashes TEXT[],
  p_entity_type TEXT DEFAULT 'email'
) RETURNS TABLE (
  entity_hash TEXT,
  fraud_score INTEGER,
  return_rate DECIMAL,
  merchant_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fi.entity_hash,
    fi.fraud_score,
    fi.return_rate,
    fi.merchant_count
  FROM fraud_intelligence fi
  WHERE fi.entity_type = p_entity_type
    AND fi.entity_hash = ANY(p_entity_hashes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_fraud_intelligence_batch IS 'Batch query fraud intelligence for multiple entities';
