-- ReturnGuard Test Data Creation Script (Simplified - No Triggers)
-- Run this in Supabase SQL Editor AFTER running fix-trigger.sql

-- ============================================================================
-- STEP 1: Disable trigger temporarily to avoid errors
-- ============================================================================

ALTER TABLE returns DISABLE TRIGGER trigger_queue_fraud_analysis;

-- ============================================================================
-- STEP 2: Create Test Merchant
-- ============================================================================

INSERT INTO merchants (
  id,
  shop_domain,
  shopify_shop_id,
  access_token_encrypted,
  access_token_iv,
  access_token_auth_tag,
  shop_name,
  shop_email,
  shop_owner,
  plan,
  returns_quota,
  returns_used_this_month,
  data_sharing_enabled,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'test-fashion-store.myshopify.com',
  'TEST_SHOP_12345',
  'encrypted_test_token_placeholder',
  'test_iv_placeholder',
  'test_auth_tag_placeholder',
  'Test Fashion Store',
  'owner@teststore.com',
  'Test Store Owner',
  'professional',
  100,
  0,
  true,
  true,
  NOW(),
  NOW()
) ON CONFLICT (shop_domain) DO UPDATE
SET updated_at = NOW();

-- ============================================================================
-- STEP 3: Create Test Customers
-- ============================================================================

-- Customer 1: Good Customer (Low Risk)
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
INSERT INTO customers (
  merchant_id,
  shopify_customer_id,
  email,
  first_name,
  last_name,
  phone,
  total_orders,
  total_spent,
  total_returns,
  return_rate,
  risk_score,
  risk_level,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  '111111',
  'sarah.johnson@example.com',
  'Sarah',
  'Johnson',
  '+1-555-0101',
  10,
  5000.00,
  1,
  10.0,
  15,
  'low',
  NOW() - INTERVAL '365 days',
  NOW() - INTERVAL '365 days'
FROM merchant m
ON CONFLICT (merchant_id, shopify_customer_id) DO NOTHING;

-- Customer 2: Serial Returner (Critical Risk)
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
INSERT INTO customers (
  merchant_id,
  shopify_customer_id,
  email,
  first_name,
  last_name,
  phone,
  total_orders,
  total_spent,
  total_returns,
  return_rate,
  risk_score,
  risk_level,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  '222222',
  'john.returner@fraud.com',
  'John',
  'Returner',
  '+1-555-0202',
  12,
  6000.00,
  10,
  83.3,
  92,
  'critical',
  NOW() - INTERVAL '180 days',
  NOW() - INTERVAL '180 days'
FROM merchant m
ON CONFLICT (merchant_id, shopify_customer_id) DO NOTHING;

-- Customer 3: Wardrobing Suspect (High Risk)
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
INSERT INTO customers (
  merchant_id,
  shopify_customer_id,
  email,
  first_name,
  last_name,
  phone,
  total_orders,
  total_spent,
  total_returns,
  return_rate,
  risk_score,
  risk_level,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  '333333',
  'jane.smith@example.com',
  'Jane',
  'Smith',
  '+1-555-0303',
  8,
  4800.00,
  6,
  75.0,
  88,
  'high',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '45 days'
FROM merchant m
ON CONFLICT (merchant_id, shopify_customer_id) DO NOTHING;

-- ============================================================================
-- STEP 4: Create Orders
-- ============================================================================

-- Orders for Good Customer
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE shopify_customer_id = '111111' LIMIT 1)
INSERT INTO orders (
  merchant_id,
  customer_id,
  shopify_order_id,
  order_number,
  email,
  total_price,
  currency,
  financial_status,
  line_items,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  c.id,
  'ORDER_' || LPAD(generate_series::text, 4, '0'),
  '#1' || LPAD(generate_series::text, 3, '0'),
  'sarah.johnson@example.com',
  500.00,
  'USD',
  'paid',
  '[{"id": 1, "title": "Blue Jeans", "quantity": 1, "price": "500.00"}]'::jsonb,
  NOW() - (generate_series * 30 || ' days')::INTERVAL,
  NOW() - (generate_series * 30 || ' days')::INTERVAL
FROM merchant m, customer c, generate_series(1, 10)
ON CONFLICT (merchant_id, shopify_order_id) DO NOTHING;

-- Orders for Serial Returner
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE shopify_customer_id = '222222' LIMIT 1)
INSERT INTO orders (
  merchant_id,
  customer_id,
  shopify_order_id,
  order_number,
  email,
  total_price,
  currency,
  financial_status,
  line_items,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  c.id,
  'ORDER_' || LPAD((generate_series + 100)::text, 4, '0'),
  '#2' || LPAD(generate_series::text, 3, '0'),
  'john.returner@fraud.com',
  500.00,
  'USD',
  'paid',
  '[{"id": 2, "title": "Designer Dress", "quantity": 1, "price": "500.00"}]'::jsonb,
  NOW() - (generate_series * 14 || ' days')::INTERVAL,
  NOW() - (generate_series * 14 || ' days')::INTERVAL
FROM merchant m, customer c, generate_series(1, 12)
ON CONFLICT (merchant_id, shopify_order_id) DO NOTHING;

-- Orders for Wardrobing Customer
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE shopify_customer_id = '333333' LIMIT 1)
INSERT INTO orders (
  merchant_id,
  customer_id,
  shopify_order_id,
  order_number,
  email,
  total_price,
  currency,
  financial_status,
  line_items,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  c.id,
  'ORDER_' || LPAD((generate_series + 200)::text, 4, '0'),
  '#3' || LPAD(generate_series::text, 3, '0'),
  'jane.smith@example.com',
  600.00,
  'USD',
  'paid',
  '[{"id": 3, "title": "Evening Gown", "quantity": 1, "price": "600.00"}]'::jsonb,
  NOW() - (generate_series * 7 || ' days')::INTERVAL,
  NOW() - (generate_series * 7 || ' days')::INTERVAL
FROM merchant m, customer c, generate_series(1, 8)
ON CONFLICT (merchant_id, shopify_order_id) DO NOTHING;

-- ============================================================================
-- STEP 5: Create Returns
-- ============================================================================

-- 1 return for Good Customer
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE shopify_customer_id = '111111' LIMIT 1),
     order_to_return AS (SELECT id, shopify_created_at FROM orders WHERE shopify_order_id = 'ORDER_0001' LIMIT 1)
INSERT INTO returns (
  merchant_id,
  customer_id,
  order_id,
  shopify_return_id,
  return_reason,
  return_value,
  currency,
  return_status,
  source,
  is_fraudulent,
  fraud_confidence,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  c.id,
  o.id,
  'REFUND_0001',
  'defective',
  500.00,
  'USD',
  'completed',
  'shopify_refund',
  false,
  5.0,
  o.shopify_created_at + INTERVAL '7 days',
  o.shopify_created_at + INTERVAL '7 days'
FROM merchant m, customer c, order_to_return o
ON CONFLICT (merchant_id, shopify_return_id, source) DO NOTHING;

-- 10 returns for Serial Returner
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE shopify_customer_id = '222222' LIMIT 1),
     orders_to_return AS (
       SELECT o.id, o.shopify_created_at,
              ROW_NUMBER() OVER (ORDER BY o.shopify_created_at) as rn
       FROM orders o
       WHERE o.shopify_order_id LIKE 'ORDER_01%'
       LIMIT 10
     )
INSERT INTO returns (
  merchant_id,
  customer_id,
  order_id,
  shopify_return_id,
  return_reason,
  return_value,
  currency,
  return_status,
  source,
  is_fraudulent,
  fraud_confidence,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  c.id,
  o.id,
  'REFUND_' || LPAD((100 + o.rn)::text, 4, '0'),
  CASE
    WHEN o.rn <= 3 THEN 'not as described'
    WHEN o.rn <= 6 THEN 'changed mind'
    ELSE 'sizing issue'
  END,
  500.00,
  'USD',
  'completed',
  'shopify_refund',
  true,
  85.0,
  o.shopify_created_at + INTERVAL '3 days',
  o.shopify_created_at + INTERVAL '3 days'
FROM merchant m, customer c, orders_to_return o
ON CONFLICT (merchant_id, shopify_return_id, source) DO NOTHING;

-- 6 returns for Wardrobing Customer
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE shopify_customer_id = '333333' LIMIT 1),
     orders_to_return AS (
       SELECT o.id, o.shopify_created_at,
              ROW_NUMBER() OVER (ORDER BY o.shopify_created_at) as rn
       FROM orders o
       WHERE o.shopify_order_id LIKE 'ORDER_02%'
       LIMIT 6
     )
INSERT INTO returns (
  merchant_id,
  customer_id,
  order_id,
  shopify_return_id,
  return_reason,
  return_value,
  currency,
  return_status,
  source,
  is_fraudulent,
  fraud_confidence,
  shopify_created_at,
  created_at
)
SELECT
  m.id,
  c.id,
  o.id,
  'REFUND_' || LPAD((200 + o.rn)::text, 4, '0'),
  'wore to event',
  600.00,
  'USD',
  'completed',
  'shopify_refund',
  true,
  78.0,
  o.shopify_created_at + INTERVAL '3 days',
  o.shopify_created_at + INTERVAL '3 days'
FROM merchant m, customer c, orders_to_return o
ON CONFLICT (merchant_id, shopify_return_id, source) DO NOTHING;

-- ============================================================================
-- STEP 6: Re-enable trigger
-- ============================================================================

ALTER TABLE returns ENABLE TRIGGER trigger_queue_fraud_analysis;

-- ============================================================================
-- STEP 7: Verify Test Data
-- ============================================================================

SELECT 'TEST DATA CREATED SUCCESSFULLY!' as status;

SELECT
  'Merchant' as table_name,
  COUNT(*) as count
FROM merchants
WHERE shop_domain = 'test-fashion-store.myshopify.com'

UNION ALL

SELECT
  'Customers' as table_name,
  COUNT(*) as count
FROM customers
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')

UNION ALL

SELECT
  'Orders' as table_name,
  COUNT(*) as count
FROM orders
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')

UNION ALL

SELECT
  'Returns' as table_name,
  COUNT(*) as count
FROM returns
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com');

-- Show customer risk scores
SELECT
  first_name || ' ' || last_name as customer_name,
  email,
  total_orders,
  total_returns,
  return_rate,
  risk_score,
  risk_level
FROM customers
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
ORDER BY risk_score DESC;
