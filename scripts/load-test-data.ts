import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function loadTestData() {
  console.log('🔄 Loading test data...\n');

  // STEP 1: Create Test Merchant
  const merchantId = '11111111-1111-1111-1111-111111111111';

  const { error: merchantError } = await supabase
    .from('merchants')
    .upsert({
      id: merchantId,
      shop_domain: 'test-fashion-store.myshopify.com',
      shopify_shop_id: 'TEST_SHOP_12345',
      access_token_encrypted: 'encrypted_token_placeholder',
      access_token_iv: 'iv_placeholder',
      access_token_auth_tag: 'auth_tag_placeholder',
      shop_name: 'Test Fashion Store',
      shop_email: 'owner@testfashionstore.com',
      shop_owner: 'Store Owner',
      plan: 'professional',
      returns_quota: 100,
      returns_used_this_month: 0,
      data_sharing_enabled: true,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'shop_domain'
    });

  if (merchantError) {
    console.error('❌ Merchant error:', merchantError);
    process.exit(1);
  }
  console.log('✅ Merchant created');

  // STEP 2: Create 3 Test Customers
  const customers = [
    {
      id: '22222222-2222-2222-2222-222222222222',
      merchant_id: merchantId,
      shopify_customer_id: 'shopify_111',
      email: 'sarah.johnson@example.com',
      first_name: 'Sarah',
      last_name: 'Johnson',
      phone: '+1-555-0101',
      total_orders: 10,
      total_spent: 5000.00,
      total_returns: 1,
      return_rate: 10.0,
      risk_score: 15,
      risk_level: 'low',
      shopify_created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      merchant_id: merchantId,
      shopify_customer_id: 'shopify_222',
      email: 'jane.smith@example.com',
      first_name: 'Jane',
      last_name: 'Smith',
      phone: '+1-555-0202',
      total_orders: 8,
      total_spent: 4800.00,
      total_returns: 6,
      return_rate: 75.0,
      risk_score: 88,
      risk_level: 'high',
      shopify_created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      merchant_id: merchantId,
      shopify_customer_id: 'shopify_333',
      email: 'john.returner@fraud.com',
      first_name: 'John',
      last_name: 'Returner',
      phone: '+1-555-0303',
      total_orders: 12,
      total_spent: 5400.00,
      total_returns: 10,
      return_rate: 83.3,
      risk_score: 92,
      risk_level: 'critical',
      shopify_created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  const { error: customersError } = await supabase
    .from('customers')
    .upsert(customers, {
      onConflict: 'merchant_id,shopify_customer_id'
    });

  if (customersError) {
    console.error('❌ Customers error:', customersError);
    process.exit(1);
  }
  console.log('✅ 3 customers created');

  // STEP 3: Create Orders
  const orders = [];

  // Sarah's orders (10 total)
  for (let i = 1; i <= 10; i++) {
    orders.push({
      merchant_id: merchantId,
      customer_id: '22222222-2222-2222-2222-222222222222',
      shopify_order_id: `order_sarah_${i}`,
      order_number: `#S${String(i).padStart(3, '0')}`,
      email: 'sarah.johnson@example.com',
      total_price: 500.00,
      currency: 'USD',
      financial_status: 'paid',
      line_items: [{ id: i, title: 'Blue Jeans', quantity: 1, price: '500.00' }],
      shopify_created_at: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Jane's orders (8 total)
  for (let i = 1; i <= 8; i++) {
    orders.push({
      merchant_id: merchantId,
      customer_id: '33333333-3333-3333-3333-333333333333',
      shopify_order_id: `order_jane_${i}`,
      order_number: `#J${String(i).padStart(3, '0')}`,
      email: 'jane.smith@example.com',
      total_price: 600.00,
      currency: 'USD',
      financial_status: 'paid',
      line_items: [{ id: i + 10, title: 'Evening Gown', quantity: 1, price: '600.00' }],
      shopify_created_at: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // John's orders (12 total)
  for (let i = 1; i <= 12; i++) {
    orders.push({
      merchant_id: merchantId,
      customer_id: '44444444-4444-4444-4444-444444444444',
      shopify_order_id: `order_john_${i}`,
      order_number: `#JR${String(i).padStart(3, '0')}`,
      email: 'john.returner@fraud.com',
      total_price: 450.00,
      currency: 'USD',
      financial_status: 'paid',
      line_items: [{ id: i + 20, title: 'Designer Dress', quantity: 1, price: '450.00' }],
      shopify_created_at: new Date(Date.now() - i * 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - i * 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  const { error: ordersError } = await supabase
    .from('orders')
    .upsert(orders, {
      onConflict: 'merchant_id,shopify_order_id'
    });

  if (ordersError) {
    console.error('❌ Orders error:', ordersError);
    process.exit(1);
  }
  console.log('✅ 30 orders created');

  // STEP 4: Get order IDs for returns
  const { data: ordersData, error: fetchError } = await supabase
    .from('orders')
    .select('id, shopify_order_id, shopify_created_at')
    .eq('merchant_id', merchantId);

  if (fetchError || !ordersData) {
    console.error('❌ Could not fetch orders:', fetchError);
    process.exit(1);
  }

  // STEP 5: Create Returns (disable trigger by marking fraud_confidence)
  const returns = [];

  // Sarah: 1 legitimate return
  const sarahOrder = ordersData.find(o => o.shopify_order_id === 'order_sarah_5');
  if (sarahOrder) {
    returns.push({
      merchant_id: merchantId,
      customer_id: '22222222-2222-2222-2222-222222222222',
      order_id: sarahOrder.id,
      shopify_return_id: 'refund_sarah_1',
      return_reason: 'defective',
      return_value: 500.00,
      currency: 'USD',
      return_status: 'completed',
      source: 'shopify_refund',
      is_fraudulent: false,
      fraud_confidence: 5.0,
      shopify_created_at: new Date(new Date(sarahOrder.shopify_created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(new Date(sarahOrder.shopify_created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  // Jane: 6 wardrobing returns
  const janeOrders = ordersData.filter(o => o.shopify_order_id.startsWith('order_jane_')).slice(0, 6);
  janeOrders.forEach((order, i) => {
    returns.push({
      merchant_id: merchantId,
      customer_id: '33333333-3333-3333-3333-333333333333',
      order_id: order.id,
      shopify_return_id: `refund_jane_${i + 1}`,
      return_reason: 'wore once to event',
      return_value: 600.00,
      currency: 'USD',
      return_status: 'completed',
      source: 'shopify_refund',
      is_fraudulent: true,
      fraud_confidence: 78.0,
      shopify_created_at: new Date(new Date(order.shopify_created_at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(new Date(order.shopify_created_at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  // John: 10 serial returns
  const johnOrders = ordersData.filter(o => o.shopify_order_id.startsWith('order_john_')).slice(0, 10);
  const reasons = ['wrong size', 'changed mind', 'not as expected'];
  johnOrders.forEach((order, i) => {
    returns.push({
      merchant_id: merchantId,
      customer_id: '44444444-4444-4444-4444-444444444444',
      order_id: order.id,
      shopify_return_id: `refund_john_${i + 1}`,
      return_reason: reasons[i % 3],
      return_value: 450.00,
      currency: 'USD',
      return_status: 'completed',
      source: 'shopify_refund',
      is_fraudulent: true,
      fraud_confidence: 85.0,
      shopify_created_at: new Date(new Date(order.shopify_created_at).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(new Date(order.shopify_created_at).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  const { error: returnsError } = await supabase
    .from('returns')
    .upsert(returns, {
      onConflict: 'merchant_id,shopify_return_id,source'
    });

  if (returnsError) {
    console.error('❌ Returns error:', returnsError);
    process.exit(1);
  }
  console.log('✅ 17 returns created');

  // STEP 6: Create Fraud Alerts
  const alerts = [
    {
      merchant_id: merchantId,
      customer_id: '33333333-3333-3333-3333-333333333333',
      alert_type: 'serial_returner',
      severity: 'high',
      message: 'High return rate (75%) with wardrobing pattern detected',
      metadata: {
        fraud_score: 88,
        triggered_signals: ['high_frequency_returns', 'wardrobing_pattern', 'quick_return_time'],
        return_rate: 75.0,
        customer_email: 'jane.smith@example.com'
      },
      is_read: false,
      is_acknowledged: false,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      merchant_id: merchantId,
      customer_id: '44444444-4444-4444-4444-444444444444',
      alert_type: 'serial_returner',
      severity: 'critical',
      message: 'Extremely high return rate (83%) - Serial returner pattern',
      metadata: {
        fraud_score: 92,
        triggered_signals: ['high_frequency_returns', 'high_return_rate', 'velocity_spike'],
        return_rate: 83.3,
        customer_email: 'john.returner@fraud.com'
      },
      is_read: false,
      is_acknowledged: false,
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  const { error: alertsError } = await supabase
    .from('fraud_alerts')
    .upsert(alerts);

  if (alertsError) {
    console.error('❌ Fraud alerts error:', alertsError);
    console.error('Details:', JSON.stringify(alertsError, null, 2));
  } else {
    console.log('✅ 2 fraud alerts created');
  }

  console.log('\n🎉 TEST DATA LOADED SUCCESSFULLY!\n');
  console.log('📊 Summary:');
  console.log('   Merchant: Test Fashion Store');
  console.log('   Customers: 3');
  console.log('     - Sarah Johnson: 15 risk (LOW - 🟢)');
  console.log('     - Jane Smith: 88 risk (HIGH - 🟠)');
  console.log('     - John Returner: 92 risk (CRITICAL - 🔴)');
  console.log('   Orders: 30');
  console.log('   Returns: 17');
  console.log('   Fraud Alerts: 2\n');
  console.log('🎯 Refresh http://localhost:3000/dashboard to see data\n');
}

loadTestData().catch(console.error);
