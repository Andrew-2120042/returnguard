-- ReturnGuard Test Data Creation Script
-- Run this in Supabase SQL Editor to create comprehensive test data

-- ============================================================================
-- STEP 1: Create Test Merchant
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
SET updated_at = NOW()
RETURNING id, shop_domain;

-- Save this ID for later use
-- \set merchant_id 'PASTE_ID_HERE'

-- ============================================================================
-- STEP 2: Create Test Customers
-- ============================================================================

-- Customer 1: Good Customer (Low Risk - 10 orders, 1 return = 10% return rate)
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
INSERT INTO customers (
  merchant_id,
  shopify_customer_id,
  email,
  email_hash,
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
  created_at,
  updated_at
)
SELECT
  m.id,
  '111111',
  'good.customer@example.com',
  encode(digest('good.customer@example.com' || (SELECT COALESCE(current_setting('app.salt', true), 'SALT')), 'sha256'), 'hex'),
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
  NOW() - INTERVAL '365 days',
  NOW()
FROM merchant m
ON CONFLICT (merchant_id, shopify_customer_id) DO UPDATE
SET updated_at = NOW()
RETURNING id, email;

-- Customer 2: Serial Returner (High Risk - 12 orders, 10 returns = 83% return rate)
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
INSERT INTO customers (
  merchant_id,
  shopify_customer_id,
  email,
  email_hash,
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
  created_at,
  updated_at
)
SELECT
  m.id,
  '222222',
  'serial.returner@fraud.com',
  encode(digest('serial.returner@fraud.com' || (SELECT COALESCE(current_setting('app.salt', true), 'SALT')), 'sha256'), 'hex'),
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
  NOW() - INTERVAL '180 days',
  NOW()
FROM merchant m
ON CONFLICT (merchant_id, shopify_customer_id) DO UPDATE
SET updated_at = NOW()
RETURNING id, email;

-- Customer 3: Wardrobing Suspect (Critical Risk - 8 orders, 6 returns = 75% return rate, quick returns)
WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
INSERT INTO customers (
  merchant_id,
  shopify_customer_id,
  email,
  email_hash,
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
  created_at,
  updated_at
)
SELECT
  m.id,
  '333333',
  'wardrobing.jane@example.com',
  encode(digest('wardrobing.jane@example.com' || (SELECT COALESCE(current_setting('app.salt', true), 'SALT')), 'sha256'), 'hex'),
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
  NOW() - INTERVAL '45 days',
  NOW()
FROM merchant m
ON CONFLICT (merchant_id, shopify_customer_id) DO UPDATE
SET updated_at = NOW()
RETURNING id, email;

-- ============================================================================
-- STEP 3: Create Orders for Good Customer
-- ============================================================================

WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE email = 'good.customer@example.com')
INSERT INTO orders (
  merchant_id,
  customer_id,
  shopify_order_id,
  order_number,
  email,
  total_price,
  subtotal_price,
  currency,
  financial_status,
  fulfillment_status,
  line_items,
  shopify_created_at,
  created_at,
  updated_at
)
SELECT
  m.id,
  c.id,
  'ORDER_' || LPAD(generate_series::text, 4, '0'),
  '#1' || LPAD(generate_series::text, 3, '0'),
  'good.customer@example.com',
  500.00,
  475.00,
  'USD',
  'paid',
  'fulfilled',
  '[{"id": 1, "title": "Blue Jeans", "quantity": 1, "price": "475.00"}]'::jsonb,
  NOW() - (generate_series * 30 || ' days')::INTERVAL,
  NOW() - (generate_series * 30 || ' days')::INTERVAL,
  NOW()
FROM merchant m, customer c, generate_series(1, 10)
ON CONFLICT (merchant_id, shopify_order_id) DO NOTHING;

-- ============================================================================
-- STEP 4: Create Orders for Serial Returner
-- ============================================================================

WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE email = 'serial.returner@fraud.com')
INSERT INTO orders (
  merchant_id,
  customer_id,
  shopify_order_id,
  order_number,
  email,
  total_price,
  subtotal_price,
  currency,
  financial_status,
  fulfillment_status,
  line_items,
  shopify_created_at,
  created_at,
  updated_at
)
SELECT
  m.id,
  c.id,
  'ORDER_' || LPAD((generate_series + 100)::text, 4, '0'),
  '#2' || LPAD(generate_series::text, 3, '0'),
  'serial.returner@fraud.com',
  500.00,
  475.00,
  'USD',
  'paid',
  'fulfilled',
  '[{"id": 2, "title": "Designer Dress", "quantity": 1, "price": "475.00"}]'::jsonb,
  NOW() - (generate_series * 14 || ' days')::INTERVAL,
  NOW() - (generate_series * 14 || ' days')::INTERVAL,
  NOW()
FROM merchant m, customer c, generate_series(1, 12)
ON CONFLICT (merchant_id, shopify_order_id) DO NOTHING;

-- ============================================================================
-- STEP 5: Create Orders for Wardrobing Customer
-- ============================================================================

WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE email = 'wardrobing.jane@example.com')
INSERT INTO orders (
  merchant_id,
  customer_id,
  shopify_order_id,
  order_number,
  email,
  total_price,
  subtotal_price,
  currency,
  financial_status,
  fulfillment_status,
  line_items,
  shopify_created_at,
  created_at,
  updated_at
)
SELECT
  m.id,
  c.id,
  'ORDER_' || LPAD((generate_series + 200)::text, 4, '0'),
  '#3' || LPAD(generate_series::text, 3, '0'),
  'wardrobing.jane@example.com',
  600.00,
  575.00,
  'USD',
  'paid',
  'fulfilled',
  '[{"id": 3, "title": "Evening Gown", "quantity": 1, "price": "575.00"}]'::jsonb,
  NOW() - (generate_series * 7 || ' days')::INTERVAL,
  NOW() - (generate_series * 7 || ' days')::INTERVAL,
  NOW()
FROM merchant m, customer c, generate_series(1, 8)
ON CONFLICT (merchant_id, shopify_order_id) DO NOTHING;

-- ============================================================================
-- STEP 6: Create Returns for Good Customer (1 return out of 10)
-- ============================================================================

WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE email = 'good.customer@example.com'),
     order_to_return AS (
       SELECT o.id, o.shopify_created_at
       FROM orders o
       WHERE o.customer_id = (SELECT id FROM customer)
       AND o.shopify_order_id = 'ORDER_0001'
       LIMIT 1
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
  shopify_created_at,
  created_at,
  updated_at
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
  o.shopify_created_at + INTERVAL '7 days',
  o.shopify_created_at + INTERVAL '7 days',
  NOW()
FROM merchant m, customer c, order_to_return o
ON CONFLICT (merchant_id, shopify_return_id, source) DO NOTHING;

-- ============================================================================
-- STEP 7: Create Returns for Serial Returner (10 returns out of 12)
-- ============================================================================

WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE email = 'serial.returner@fraud.com'),
     orders_to_return AS (
       SELECT o.id, o.shopify_created_at, o.shopify_order_id,
              ROW_NUMBER() OVER (ORDER BY o.shopify_created_at) as rn
       FROM orders o
       WHERE o.customer_id = (SELECT id FROM customer)
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
  shopify_created_at,
  created_at,
  updated_at
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
  o.shopify_created_at + INTERVAL '3 days',
  o.shopify_created_at + INTERVAL '3 days',
  NOW()
FROM merchant m, customer c, orders_to_return o
ON CONFLICT (merchant_id, shopify_return_id, source) DO NOTHING;

-- ============================================================================
-- STEP 8: Create Wardrobing Returns (6 returns out of 8, all within 3 days)
-- ============================================================================

WITH merchant AS (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com'),
     customer AS (SELECT id FROM customers WHERE email = 'wardrobing.jane@example.com'),
     orders_to_return AS (
       SELECT o.id, o.shopify_created_at, o.shopify_order_id,
              ROW_NUMBER() OVER (ORDER BY o.shopify_created_at) as rn
       FROM orders o
       WHERE o.customer_id = (SELECT id FROM customer)
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
  shopify_created_at,
  created_at,
  updated_at
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
  o.shopify_created_at + INTERVAL '3 days',
  o.shopify_created_at + INTERVAL '3 days',
  NOW()
FROM merchant m, customer c, orders_to_return o
ON CONFLICT (merchant_id, shopify_return_id, source) DO NOTHING;

-- ============================================================================
-- STEP 9: Verify Test Data Created
-- ============================================================================

SELECT 'TEST DATA SUMMARY' as section;

SELECT
  'Merchants' as table_name,
  COUNT(*) as row_count
FROM merchants
WHERE shop_domain = 'test-fashion-store.myshopify.com'

UNION ALL

SELECT
  'Customers' as table_name,
  COUNT(*) as row_count
FROM customers
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')

UNION ALL

SELECT
  'Orders' as table_name,
  COUNT(*) as row_count
FROM orders
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')

UNION ALL

SELECT
  'Returns' as table_name,
  COUNT(*) as row_count
FROM returns
WHERE merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com');

-- ============================================================================
-- STEP 10: Display Customer Summary
-- ============================================================================

SELECT
  c.first_name || ' ' || c.last_name as customer_name,
  c.email,
  c.total_orders,
  c.total_returns,
  c.return_rate,
  c.risk_score,
  c.risk_level
FROM customers c
WHERE c.merchant_id = (SELECT id FROM merchants WHERE shop_domain = 'test-fashion-store.myshopify.com')
ORDER BY c.risk_score DESC;

-- Test data created successfully!
-- Expected results:
-- - 1 merchant
-- - 3 customers (Good: 15 risk, Serial Returner: 92 risk, Wardrobing: 88 risk)
-- - 30 orders (10 + 12 + 8)
-- - 17 returns (1 + 10 + 6)
