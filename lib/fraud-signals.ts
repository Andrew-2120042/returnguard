/**
 * Fraud Signal Calculators
 * Phase 2: 12 individual fraud signals that contribute to risk score
 *
 * Each signal returns:
 * - signal_id: unique identifier
 * - signal_name: human-readable name
 * - score: points contributed (0 to max_score)
 * - max_score: maximum possible points
 * - triggered: boolean if signal is active
 * - details: explanation of why signal triggered
 */

import type { Customer, Order, Return, FraudSignalResult } from './types';
import { supabase } from './supabase-client';

// ============================================================================
// HELPER: PRODUCT CATEGORY DETECTION
// ============================================================================
type ProductCategory = 'fashion' | 'electronics' | 'beauty' | 'home' | 'other';

function detectProductCategory(orders: Order[]): ProductCategory {
  if (!orders || orders.length === 0) return 'other';

  const keywords = {
    fashion: ['clothing', 'apparel', 'dress', 'shirt', 'pants', 'jeans', 'shoes', 'sneaker', 'boot', 'jacket', 'coat', 'fashion', 'wear', 'outfit', 'skirt', 'blouse', 'sweater', 'hoodie', 't-shirt', 'tee'],
    electronics: ['electronics', 'computer', 'laptop', 'phone', 'tablet', 'gadget', 'tech', 'device', 'console', 'gaming', 'headphone', 'speaker', 'camera', 'monitor', 'keyboard', 'mouse'],
    beauty: ['beauty', 'makeup', 'skincare', 'cosmetic', 'perfume', 'lotion', 'cream', 'serum', 'mascara', 'lipstick', 'foundation', 'hair', 'nail'],
    home: ['furniture', 'home', 'kitchen', 'decor', 'bed', 'table', 'chair', 'lamp', 'rug', 'curtain', 'pillow', 'blanket']
  };

  const categoryCounts: Record<ProductCategory, number> = {
    fashion: 0,
    electronics: 0,
    beauty: 0,
    home: 0,
    other: 0
  };

  // Count keyword matches across all orders' line items
  orders.forEach(order => {
    const lineItems = order.line_items || [];
    lineItems.forEach(item => {
      const searchText = (item.title || '').toLowerCase();

      let matched = false;

      for (const [category, words] of Object.entries(keywords)) {
        if (words.some(word => searchText.includes(word))) {
          categoryCounts[category as ProductCategory]++;
          matched = true;
          break;
        }
      }

      if (!matched) {
        categoryCounts.other++;
      }
    });
  });

  // Return category with highest count
  let maxCategory: ProductCategory = 'other';
  let maxCount = 0;

  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxCategory = category as ProductCategory;
    }
  }

  return maxCategory;
}

// ============================================================================
// SIGNAL 1: RETURN RATE (max 40 points) - CATEGORY-AWARE
// ============================================================================
export async function calculateReturnRateSignal(
  customer: Customer,
  merchantId: string
): Promise<FraudSignalResult> {
  const returnRate =
    customer.total_orders > 0
      ? (customer.total_returns / customer.total_orders) * 100
      : 0;

  // Fetch customer's orders to determine product category
  const { data: orders } = await supabase
    .from('orders')
    .select('line_items')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customer.id);

  const category = detectProductCategory((orders as Order[]) || []);

  // Category-specific thresholds
  const thresholds = {
    fashion: {
      low: 50,      // <50% = normal for fashion
      medium: 60,   // 50-60% = watch
      high: 75,     // 60-75% = concerning
      critical: 85  // >85% = fraud
    },
    electronics: {
      low: 20,
      medium: 30,
      high: 40,
      critical: 60
    },
    beauty: {
      low: 30,
      medium: 40,
      high: 55,
      critical: 70
    },
    home: {
      low: 15,
      medium: 25,
      high: 35,
      critical: 50
    },
    other: {
      low: 30,
      medium: 40,
      high: 55,
      critical: 70
    }
  };

  const categoryThreshold = thresholds[category];

  // Score based on category-specific thresholds (0-40 points)
  let score = 0;
  let level: 'normal' | 'low' | 'medium' | 'high' | 'critical' = 'normal';

  if (returnRate >= categoryThreshold.critical) {
    score = 40;
    level = 'critical';
  } else if (returnRate >= categoryThreshold.high) {
    score = 30;
    level = 'high';
  } else if (returnRate >= categoryThreshold.medium) {
    score = 15;
    level = 'medium';
  } else if (returnRate >= categoryThreshold.low) {
    score = 5;
    level = 'low';
  }

  const triggered = score > 15; // Trigger if medium or above

  return {
    signal_id: 1,
    signal_name: 'Return Rate',
    score,
    max_score: 40,
    triggered,
    details: `${returnRate.toFixed(1)}% return rate (${level} for ${category}). ${category === 'fashion' ? 'Fashion threshold: 85% critical.' : `Threshold: ${categoryThreshold.critical}% critical.`}`,
    metadata: {
      return_rate: returnRate,
      category,
      threshold: categoryThreshold,
      total_orders: customer.total_orders,
      total_returns: customer.total_returns,
      level
    },
  };
}

// ============================================================================
// SIGNAL 2: RETURN VELOCITY (max 15 points)
// ============================================================================
export async function calculateReturnVelocitySignal(
  customerId: string,
  merchantId: string
): Promise<FraudSignalResult> {
  // Count returns in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentReturns, error } = await supabase
    .from('returns')
    .select('id')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customerId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error) {
    console.error('Error fetching recent returns:', error);
    return {
      signal_id: 2,
      signal_name: 'Return Velocity',
      score: 0,
      max_score: 15,
      triggered: false,
      details: 'Unable to calculate return velocity',
    };
  }

  const returnsLast30Days = recentReturns?.length || 0;
  const score = Math.min((returnsLast30Days / 5) * 15, 15);
  const triggered = returnsLast30Days > 5;

  return {
    signal_id: 2,
    signal_name: 'Return Velocity',
    score: Math.round(score),
    max_score: 15,
    triggered,
    details: `Customer has ${returnsLast30Days} returns in last 30 days. ${triggered ? 'High velocity detected.' : 'Normal velocity.'}`,
    metadata: { returns_last_30_days: returnsLast30Days, threshold: 5 },
  };
}

// ============================================================================
// SIGNAL 3: ACCOUNT AGE (max 10 points)
// ============================================================================
export async function calculateAccountAgeSignal(
  customer: Customer
): Promise<FraudSignalResult> {
  const accountCreatedAt = customer.shopify_created_at
    ? new Date(customer.shopify_created_at)
    : new Date(customer.created_at);

  const now = new Date();
  const ageInMs = now.getTime() - accountCreatedAt.getTime();
  const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

  const score = ageInDays < 14 ? 10 : 0;
  const triggered = ageInDays < 14;

  return {
    signal_id: 3,
    signal_name: 'Account Age',
    score,
    max_score: 10,
    triggered,
    details: `Account is ${ageInDays} days old. ${triggered ? 'New account (< 14 days).' : 'Established account.'}`,
    metadata: { age_in_days: ageInDays, threshold: 14 },
  };
}

// ============================================================================
// SIGNAL 4: FIRST ORDER RETURN (max 15 points)
// ============================================================================
export async function calculateFirstOrderReturnSignal(
  customer: Customer
): Promise<FraudSignalResult> {
  const isFirstOrderReturn =
    customer.total_orders === 1 && customer.total_returns === 1;

  const score = isFirstOrderReturn ? 15 : 0;
  const triggered = isFirstOrderReturn;

  return {
    signal_id: 4,
    signal_name: 'First Order Return',
    score,
    max_score: 15,
    triggered,
    details: `${triggered ? 'Customer is returning their first (and only) purchase.' : 'Customer has made multiple orders.'}`,
    metadata: {
      total_orders: customer.total_orders,
      total_returns: customer.total_returns,
    },
  };
}

// ============================================================================
// SIGNAL 5: HIGH-VALUE RETURN PATTERN (max 10 points)
// ============================================================================
export async function calculateHighValueReturnPatternSignal(
  customerId: string,
  merchantId: string
): Promise<FraudSignalResult> {
  // Calculate average order value
  const { data: orders } = await supabase
    .from('orders')
    .select('total_price')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customerId);

  // Calculate average return value
  const { data: returns } = await supabase
    .from('returns')
    .select('return_value')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customerId);

  if (!orders || orders.length === 0 || !returns || returns.length === 0) {
    return {
      signal_id: 5,
      signal_name: 'High-Value Return Pattern',
      score: 0,
      max_score: 10,
      triggered: false,
      details: 'Insufficient data to calculate pattern',
    };
  }

  const avgOrderValue =
    orders.reduce((sum, o: any) => sum + o.total_price, 0) / orders.length;
  const avgReturnValue =
    returns.reduce((sum, r: any) => sum + r.return_value, 0) / returns.length;

  const ratio = avgOrderValue > 0 ? avgReturnValue / avgOrderValue : 0;
  const score = ratio > 1.5 ? 10 : 0;
  const triggered = ratio > 1.5;

  return {
    signal_id: 5,
    signal_name: 'High-Value Return Pattern',
    score,
    max_score: 10,
    triggered,
    details: `Average return value ($${avgReturnValue.toFixed(2)}) is ${ratio.toFixed(1)}x average order value ($${avgOrderValue.toFixed(2)}). ${triggered ? 'Returns higher value items than purchases.' : 'Normal return pattern.'}`,
    metadata: {
      avg_order_value: avgOrderValue,
      avg_return_value: avgReturnValue,
      ratio,
      threshold: 1.5,
    },
  };
}

// ============================================================================
// SIGNAL 6: SERIAL RETURNER LABEL (max 20 points)
// ============================================================================
export async function calculateSerialReturnerLabelSignal(
  customer: Customer
): Promise<FraudSignalResult> {
  // Check if customer has been manually flagged
  // This would be in customer.tags or a separate flagged column
  const isFlagged = customer.tags?.includes('fraud') || customer.tags?.includes('serial_returner') || false;

  const score = isFlagged ? 20 : 0;
  const triggered = isFlagged;

  return {
    signal_id: 6,
    signal_name: 'Serial Returner Label',
    score,
    max_score: 20,
    triggered,
    details: `${triggered ? 'Customer has been manually flagged as a serial returner.' : 'Customer has not been flagged.'}`,
    metadata: { is_flagged: isFlagged, tags: customer.tags },
  };
}

// ============================================================================
// SIGNAL 7: BRACKETING DETECTION (max 15 points)
// ============================================================================
export async function calculateBracketingDetectionSignal(
  order: Order
): Promise<FraudSignalResult> {
  // Count items with same SKU but different variants (size/color)
  const lineItems = order.line_items || [];
  const skuMap = new Map<string, number>();

  lineItems.forEach((item) => {
    const baseSku = item.sku?.split('-')[0] || item.product_id?.toString();
    if (baseSku) {
      skuMap.set(baseSku, (skuMap.get(baseSku) || 0) + 1);
    }
  });

  // Find max count for any SKU (indicates bracketing)
  let maxBracketCount = 0;
  skuMap.forEach((count) => {
    if (count > maxBracketCount) {
      maxBracketCount = count;
    }
  });

  const score =
    maxBracketCount > 3 ? 15 : Math.min(maxBracketCount * 3, 15);
  const triggered = maxBracketCount > 3;

  return {
    signal_id: 7,
    signal_name: 'Bracketing Detection',
    score: Math.round(score),
    max_score: 15,
    triggered,
    details: `${triggered ? `Order contains ${maxBracketCount} variants of same item (bracketing).` : 'No bracketing detected.'}`,
    metadata: { max_bracket_count: maxBracketCount, threshold: 3 },
  };
}

// ============================================================================
// SIGNAL 8: WARDROBING TIMELINE (max 15 points)
// ============================================================================
export async function calculateWardrobingTimelineSignal(
  order: Order,
  returnRecord: Return
): Promise<FraudSignalResult> {
  // Calculate days between delivery and return
  const deliveredAt = order.fulfilled_at
    ? new Date(order.fulfilled_at)
    : null;
  const returnedAt = returnRecord.shopify_created_at
    ? new Date(returnRecord.shopify_created_at)
    : new Date(returnRecord.created_at);

  if (!deliveredAt) {
    return {
      signal_id: 8,
      signal_name: 'Wardrobing Timeline',
      score: 0,
      max_score: 15,
      triggered: false,
      details: 'Delivery date not available',
    };
  }

  const diffMs = returnedAt.getTime() - deliveredAt.getTime();
  const daysToReturn = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const score = daysToReturn <= 3 ? 15 : 0;
  const triggered = daysToReturn <= 3;

  return {
    signal_id: 8,
    signal_name: 'Wardrobing Timeline',
    score,
    max_score: 15,
    triggered,
    details: `${triggered ? `Returned within ${daysToReturn} days of delivery (possible wardrobing).` : `Returned after ${daysToReturn} days (normal timeline).`}`,
    metadata: { days_to_return: daysToReturn, threshold: 3 },
  };
}

// ============================================================================
// SIGNAL 9: HIGH ORDER VALUE (max 10 points)
// ============================================================================
export async function calculateHighOrderValueSignal(
  order: Order
): Promise<FraudSignalResult> {
  const orderValue = order.total_price;
  const score = orderValue > 500 ? 10 : 0;
  const triggered = orderValue > 500;

  return {
    signal_id: 9,
    signal_name: 'High Order Value',
    score,
    max_score: 10,
    triggered,
    details: `Order value is $${orderValue.toFixed(2)}. ${triggered ? 'High-value order (> $500).' : 'Standard value order.'}`,
    metadata: { order_value: orderValue, threshold: 500 },
  };
}

// ============================================================================
// SIGNAL 10: RETURN REASON PATTERN (max 10 points)
// ============================================================================
export async function calculateReturnReasonPatternSignal(
  customerId: string,
  merchantId: string
): Promise<FraudSignalResult> {
  // Get all returns for this customer
  const { data: returns } = await supabase
    .from('returns')
    .select('return_reason')
    .eq('merchant_id', merchantId)
    .eq('customer_id', customerId)
    .not('return_reason', 'is', null);

  if (!returns || returns.length < 2) {
    return {
      signal_id: 10,
      signal_name: 'Return Reason Pattern',
      score: 0,
      max_score: 10,
      triggered: false,
      details: 'Insufficient returns to detect pattern',
    };
  }

  // Count occurrences of each reason
  const reasonCounts = new Map<string, number>();
  returns.forEach((r: any) => {
    if (r.return_reason) {
      reasonCounts.set(
        r.return_reason,
        (reasonCounts.get(r.return_reason) || 0) + 1
      );
    }
  });

  // Find most common reason
  let mostCommonReason = '';
  let mostCommonCount = 0;
  reasonCounts.forEach((count, reason) => {
    if (count > mostCommonCount) {
      mostCommonCount = count;
      mostCommonReason = reason;
    }
  });

  const percentage = (mostCommonCount / returns.length) * 100;
  const score = percentage > 80 ? 10 : 0;
  const triggered = percentage > 80;

  return {
    signal_id: 10,
    signal_name: 'Return Reason Pattern',
    score,
    max_score: 10,
    triggered,
    details: `${triggered ? `Uses same reason ("${mostCommonReason}") ${percentage.toFixed(0)}% of the time.` : `No suspicious pattern in return reasons.`}`,
    metadata: {
      most_common_reason: mostCommonReason,
      most_common_count: mostCommonCount,
      total_returns: returns.length,
      percentage,
      threshold: 80,
    },
  };
}

// ============================================================================
// SIGNAL 11: INCOMPLETE RETURN (max 20 points)
// ============================================================================
export async function calculateIncompleteReturnSignal(
  returnRecord: Return
): Promise<FraudSignalResult> {
  // Check for flags indicating incomplete return
  // Could be in return.note or merchant notes
  const note = returnRecord.note?.toLowerCase() || '';
  const incompleteTags = [
    'missing tag',
    'missing tags',
    'no packaging',
    'damaged packaging',
    'worn',
    'used',
    'incomplete',
  ];

  const isIncomplete = incompleteTags.some((tag) => note.includes(tag));
  const score = isIncomplete ? 20 : 0;
  const triggered = isIncomplete;

  return {
    signal_id: 11,
    signal_name: 'Incomplete Return',
    score,
    max_score: 20,
    triggered,
    details: `${triggered ? 'Return flagged as incomplete (missing tags/packaging or item damaged/used).' : 'Return appears complete.'}`,
    metadata: { has_incomplete_flags: isIncomplete, note },
  };
}

// ============================================================================
// SIGNAL 12: CROSS-STORE FRAUD (max 25 points) - DISABLED FOR LAUNCH
// ============================================================================
export async function calculateCrossStoreFraudSignal(
  customer: Customer,
  merchantId: string
): Promise<FraudSignalResult> {
  // DISABLED FOR LAUNCH - Enable after legal review
  return {
    signal_id: 12,
    signal_name: 'Cross-Store Fraud',
    score: 0,
    max_score: 25,
    triggered: false,
    details: 'Cross-store intelligence coming soon (legal review in progress)',
    metadata: {
      status: 'disabled',
      reason: 'Legal review in progress - Q2 2026'
    }
  };

  /* ORIGINAL CODE - Re-enable after legal review
  const signal: FraudSignalResult = {
    signal_id: 12,
    signal_name: 'Cross-Store Fraud',
    score: 0,
    max_score: 25,
    triggered: false,
    details: 'No cross-store data available',
    metadata: {},
  };

  try {
    // 1. Check if merchant has data sharing enabled
    const { data: merchant } = await supabase
      .from('merchants')
      .select('data_sharing_enabled')
      .eq('id', merchantId)
      .single();

    const merch = merchant as any;
    if (!merch || !merch.data_sharing_enabled) {
      signal.details = 'Data sharing not enabled - upgrade to Business plan';
      return signal;
    }

    // 2. Check if cross-store fraud detection is globally enabled
    if (process.env.CROSS_STORE_FRAUD_ENABLED !== 'true') {
      signal.details = 'Cross-store fraud detection not yet available';
      return signal;
    }

    // 3. Check if customer has an email hash
    if (!customer.email_hash) {
      signal.details = 'No email hash available for cross-store lookup';
      return signal;
    }

    // 4. Query fraud intelligence using database function
    const { data: intelligence } = await (supabase as any).rpc('get_fraud_intelligence', {
      p_entity_type: 'email',
      p_entity_hash: customer.email_hash,
    });

    // 5. If no cross-store data found
    if (!intelligence || intelligence.length === 0) {
      signal.details = 'No cross-store patterns detected';
      return signal;
    }

    const fraudData = intelligence[0];

    // 6. Check if this is meaningful cross-store data (not just this merchant)
    if (fraudData.merchant_count < 2) {
      signal.details = 'No cross-store patterns detected';
      return signal;
    }

    // 7. Calculate score based on merchant count and return rate
    const merchantCount = fraudData.merchant_count;
    const returnRate = parseFloat(fraudData.return_rate);

    let score = 0;

    // Score based on merchant count (how many stores flagged this customer)
    if (merchantCount >= 2 && merchantCount <= 5) score = 5;
    else if (merchantCount >= 6 && merchantCount <= 10) score = 10;
    else if (merchantCount >= 11 && merchantCount <= 20) score = 15;
    else if (merchantCount >= 21) score = 20;

    // Bonus score based on cross-store return rate
    if (returnRate > 70) score += 5;

    signal.score = Math.min(score, signal.max_score);
    signal.triggered = merchantCount >= 3 || returnRate > 60;
    signal.details = `Email flagged by ${merchantCount} other stores with ${returnRate.toFixed(1)}% return rate`;
    signal.metadata = {
      merchant_count: merchantCount,
      cross_store_return_rate: returnRate,
      cross_store_fraud_score: fraudData.fraud_score,
      total_cross_store_orders: fraudData.total_orders,
      total_cross_store_returns: fraudData.total_returns,
      first_seen: fraudData.first_seen_at,
      last_seen: fraudData.last_seen_at,
    };

    return signal;
  } catch (error) {
    console.error('Error calculating cross-store fraud signal:', error);
    signal.details = 'Error querying cross-store fraud data';
    return signal;
  }
  */
}

// ============================================================================
// MASTER FUNCTION: Calculate All Signals
// ============================================================================
export async function calculateAllFraudSignals(
  returnId: string,
  customerId: string,
  orderId: string,
  merchantId: string
): Promise<FraudSignalResult[]> {
  // Fetch required data
  const customer: any = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  const order: any = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  const returnRecord: any = await supabase
    .from('returns')
    .select('*')
    .eq('id', returnId)
    .single();

  if (!customer.data || !order.data || !returnRecord.data) {
    throw new Error('Unable to fetch required data for fraud analysis');
  }

  // Calculate all 12 signals in parallel
  const signals = await Promise.all([
    calculateReturnRateSignal(customer.data, merchantId), // Updated with merchantId
    calculateReturnVelocitySignal(customerId, merchantId),
    calculateAccountAgeSignal(customer.data),
    calculateFirstOrderReturnSignal(customer.data),
    calculateHighValueReturnPatternSignal(customerId, merchantId),
    calculateSerialReturnerLabelSignal(customer.data),
    calculateBracketingDetectionSignal(order.data),
    calculateWardrobingTimelineSignal(order.data, returnRecord.data),
    calculateHighOrderValueSignal(order.data),
    calculateReturnReasonPatternSignal(customerId, merchantId),
    calculateIncompleteReturnSignal(returnRecord.data),
    calculateCrossStoreFraudSignal(customer.data, merchantId),
  ]);

  return signals;
}
