/**
 * Fraud Detection Engine
 * Phase 2: Main orchestrator for fraud analysis
 *
 * Ties together all fraud detection components:
 * 1. Calculate fraud signals
 * 2. Calculate risk score
 * 3. Determine action based on policies
 * 4. Apply action to return
 * 5. Generate alerts if needed
 * 6. Update fraud intelligence
 */

import { calculateRiskScore } from './risk-scoring';
import { determineAction, applyAction, executePolicyActions } from './fraud-actions';
import { generateFraudAlert } from './fraud-alerts';
import { supabase } from './supabase-client';
import type { RiskAnalysis } from './types';

/**
 * Analyze return for fraud
 * Main entry point for fraud detection
 *
 * @param returnId - Return ID
 * @param customerId - Customer ID
 * @param orderId - Order ID
 * @param merchantId - Merchant ID
 * @returns Complete risk analysis with action taken
 */
export async function analyzeFraudForReturn(
  returnId: string,
  customerId: string,
  orderId: string,
  merchantId: string
): Promise<RiskAnalysis | null> {
  try {
    console.log(`[Fraud Engine] Starting analysis for return ${returnId}`);

    // Step 1: Calculate risk score (0-100) and all fraud signals
    const riskAnalysis = await calculateRiskScore(
      returnId,
      customerId,
      orderId,
      merchantId
    );

    console.log(`[Fraud Engine] Risk score: ${riskAnalysis.risk_score} (${riskAnalysis.risk_level})`);

    // Step 2: Determine action based on merchant policies
    const { action, reason, policy } = await determineAction(
      riskAnalysis.risk_score,
      merchantId,
      returnId
    );

    console.log(`[Fraud Engine] Determined action: ${action} - ${reason}`);

    // Step 3: Apply action to return record
    const actionApplied = await applyAction(returnId, action, reason);

    if (!actionApplied) {
      console.error(`[Fraud Engine] Failed to apply action to return ${returnId}`);
      return null;
    }

    // Step 4: Execute policy actions (alerts, emails, etc.)
    if (policy) {
      await executePolicyActions(policy, returnId, merchantId, action);
    }

    // Step 5: Generate high-risk alerts
    if (riskAnalysis.risk_level === 'high') {
      await generateFraudAlert(
        merchantId,
        returnId,
        customerId,
        'high_risk_return',
        'high',
        `High-risk return detected (score: ${riskAnalysis.risk_score}/100)`,
        {
          risk_score: riskAnalysis.risk_score,
          risk_level: riskAnalysis.risk_level,
          triggered_signals: riskAnalysis.signals.filter((s) => s.triggered).length,
          action_taken: action,
        }
      );
    }

    // Step 6: Store fraud analysis in return record
    const { error: updateError } = await (supabase as any)
      .from('returns')
      .update({
        risk_score: riskAnalysis.risk_score,
        fraud_signals: riskAnalysis.signals,
        is_fraudulent: riskAnalysis.risk_level === 'high',
        fraud_confidence: riskAnalysis.risk_score,
        fraud_reasons: riskAnalysis.signals
          .filter((s: any) => s.triggered)
          .map((s: any) => s.details),
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId);

    if (updateError) {
      console.error('[Fraud Engine] Error storing fraud analysis:', updateError);
    }

    // Step 7: Update customer risk score
    await updateCustomerRiskScore(customerId, merchantId);

    // Step 8: Update fraud intelligence (Phase 3 preparation - opt-in only)
    await updateFraudIntelligence(customerId, merchantId, riskAnalysis);

    console.log(`[Fraud Engine] Analysis complete for return ${returnId}`);

    // Return complete analysis
    return {
      ...riskAnalysis,
      action_taken: action,
      action_reason: reason,
    };
  } catch (error) {
    console.error('[Fraud Engine] Error analyzing return:', error);
    return null;
  }
}

/**
 * Update customer's overall risk score
 * Based on their return history and fraud signals
 *
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 */
async function updateCustomerRiskScore(
  customerId: string,
  merchantId: string
): Promise<void> {
  try {
    // Get all returns for this customer
    const { data: returns, error } = await supabase
      .from('returns')
      .select('risk_score')
      .eq('customer_id', customerId)
      .eq('merchant_id', merchantId)
      .not('risk_score', 'is', null);

    if (error || !returns || returns.length === 0) {
      return;
    }

    // Calculate average risk score across all returns
    const avgRiskScore =
      returns.reduce((sum, r: any) => sum + (r.risk_score || 0), 0) / returns.length;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (avgRiskScore > 75) {
      riskLevel = 'critical';
    } else if (avgRiskScore > 60) {
      riskLevel = 'high';
    } else if (avgRiskScore > 30) {
      riskLevel = 'medium';
    }

    // Update customer record
    await (supabase as any)
      .from('customers')
      .update({
        risk_score: Math.round(avgRiskScore),
        risk_level: riskLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    console.log(`[Fraud Engine] Updated customer ${customerId} risk score: ${Math.round(avgRiskScore)} (${riskLevel})`);
  } catch (error) {
    console.error('[Fraud Engine] Error updating customer risk score:', error);
  }
}

/**
 * Update fraud intelligence database
 * Phase 3 preparation - only if merchant has data sharing enabled
 *
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param riskAnalysis - Risk analysis result
 */
async function updateFraudIntelligence(
  customerId: string,
  merchantId: string,
  riskAnalysis: Omit<RiskAnalysis, 'action_taken' | 'action_reason'>
): Promise<void> {
  try {
    // Check if merchant has data sharing enabled
    const { data: merchant } = await supabase
      .from('merchants')
      .select('data_sharing_enabled')
      .eq('id', merchantId)
      .single();

    const merch = merchant as any;
    if (!merch || !merch.data_sharing_enabled) {
      console.log(`[Fraud Engine] Skipping fraud intelligence update - data sharing disabled`);
      return;
    }

    // Get customer hashes
    const { data: customer } = await supabase
      .from('customers')
      .select('email_hash, phone_hash, billing_address_hash')
      .eq('id', customerId)
      .single();

    if (!customer) {
      return;
    }

    const cust = customer as any;

    // Update fraud intelligence for each identifier
    const identifiers = [
      { type: 'email', hash: cust.email_hash },
      { type: 'phone', hash: cust.phone_hash },
      { type: 'billing_address', hash: cust.billing_address_hash },
    ];

    for (const identifier of identifiers) {
      if (!identifier.hash) continue;

      // Call SQL function to update fraud intelligence
      await (supabase as any).rpc('update_fraud_intelligence', {
        p_entity_type: identifier.type,
        p_entity_hash: identifier.hash,
        p_merchant_id: merchantId,
        p_is_fraud: riskAnalysis.risk_level === 'high',
        p_fraud_score: riskAnalysis.risk_score,
      });
    }

    console.log(`[Fraud Engine] Updated fraud intelligence for customer ${customerId}`);
  } catch (error) {
    console.error('[Fraud Engine] Error updating fraud intelligence:', error);
  }
}

/**
 * Bulk analyze returns
 * For batch processing or backfilling fraud analysis
 *
 * @param merchantId - Merchant ID
 * @param limit - Maximum number of returns to analyze
 * @returns Number of returns analyzed
 */
export async function bulkAnalyzeReturns(
  merchantId: string,
  limit: number = 100
): Promise<number> {
  try {
    // Get returns without fraud analysis
    const { data: returns, error } = await supabase
      .from('returns')
      .select('id, customer_id, order_id')
      .eq('merchant_id', merchantId)
      .is('risk_score', null)
      .not('customer_id', 'is', null)
      .not('order_id', 'is', null)
      .limit(limit);

    if (error || !returns || returns.length === 0) {
      console.log('[Fraud Engine] No returns to analyze');
      return 0;
    }

    console.log(`[Fraud Engine] Bulk analyzing ${returns.length} returns`);

    let analyzed = 0;
    for (const returnRecord of (returns as any[])) {
      const result = await analyzeFraudForReturn(
        returnRecord.id,
        returnRecord.customer_id!,
        returnRecord.order_id!,
        merchantId
      );

      if (result) {
        analyzed++;
      }

      // Add delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[Fraud Engine] Bulk analysis complete: ${analyzed}/${returns.length} returns analyzed`);
    return analyzed;
  } catch (error) {
    console.error('[Fraud Engine] Error in bulk analysis:', error);
    return 0;
  }
}

/**
 * Re-analyze return with updated policies
 * Useful when merchant changes their fraud policies
 *
 * @param returnId - Return ID
 * @returns Updated risk analysis
 */
export async function reAnalyzeReturn(
  returnId: string
): Promise<RiskAnalysis | null> {
  try {
    // Get return data
    const { data: returnRecord, error } = await supabase
      .from('returns')
      .select('customer_id, order_id, merchant_id')
      .eq('id', returnId)
      .single();

    if (error || !returnRecord) {
      console.error('[Fraud Engine] Return not found:', returnId);
      return null;
    }

    const record = returnRecord as any;
    if (!record.customer_id || !record.order_id) {
      console.error('[Fraud Engine] Missing customer_id or order_id');
      return null;
    }

    // Re-run fraud analysis
    return await analyzeFraudForReturn(
      returnId,
      record.customer_id,
      record.order_id,
      record.merchant_id
    );
  } catch (error) {
    console.error('[Fraud Engine] Error re-analyzing return:', error);
    return null;
  }
}

/**
 * Get fraud statistics for merchant
 *
 * @param merchantId - Merchant ID
 * @param days - Number of days to look back (default 30)
 * @returns Fraud statistics
 */
export async function getFraudStatistics(
  merchantId: string,
  days: number = 30
): Promise<{
  total_returns_analyzed: number;
  fraud_prevented_value: number;
  high_risk_customers: number;
  average_risk_score: number;
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
  };
}> {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Get all analyzed returns
    const { data: returns } = await supabase
      .from('returns')
      .select('risk_score, action_taken, return_value')
      .eq('merchant_id', merchantId)
      .not('risk_score', 'is', null)
      .gte('created_at', sinceDate.toISOString());

    // Get high-risk customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('merchant_id', merchantId)
      .in('risk_level', ['high', 'critical']);

    if (!returns || returns.length === 0) {
      return {
        total_returns_analyzed: 0,
        fraud_prevented_value: 0,
        high_risk_customers: customers?.length || 0,
        average_risk_score: 0,
        risk_distribution: { low: 0, medium: 0, high: 0 },
      };
    }

    // Calculate statistics
    const avgRiskScore =
      returns.reduce((sum, r: any) => sum + (r.risk_score || 0), 0) / returns.length;

    const fraudPreventedValue = returns
      .filter((r: any) => r.action_taken === 'blocked')
      .reduce((sum, r: any) => sum + r.return_value, 0);

    const riskDistribution = {
      low: returns.filter((r: any) => (r.risk_score || 0) <= 30).length,
      medium: returns.filter(
        (r: any) => (r.risk_score || 0) > 30 && (r.risk_score || 0) <= 60
      ).length,
      high: returns.filter((r: any) => (r.risk_score || 0) > 60).length,
    };

    return {
      total_returns_analyzed: returns.length,
      fraud_prevented_value: fraudPreventedValue,
      high_risk_customers: customers?.length || 0,
      average_risk_score: Math.round(avgRiskScore),
      risk_distribution: riskDistribution,
    };
  } catch (error) {
    console.error('[Fraud Engine] Error getting fraud statistics:', error);
    return {
      total_returns_analyzed: 0,
      fraud_prevented_value: 0,
      high_risk_customers: 0,
      average_risk_score: 0,
      risk_distribution: { low: 0, medium: 0, high: 0 },
    };
  }
}

/**
 * Check if customer should be flagged as serial returner
 * Called after each fraud analysis
 *
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 */
export async function checkSerialReturner(
  customerId: string,
  merchantId: string
): Promise<void> {
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('total_orders, total_returns, return_rate, tags')
      .eq('id', customerId)
      .single();

    if (!customer) return;

    const cust = customer as any;

    // Criteria for serial returner:
    // 1. Return rate > 50%
    // 2. At least 5 orders
    // 3. At least 3 returns
    const isSerialReturner =
      cust.return_rate > 50 &&
      cust.total_orders >= 5 &&
      cust.total_returns >= 3;

    const tags = cust.tags || [];
    const hasSerialReturnerTag = tags.includes('serial_returner');

    if (isSerialReturner && !hasSerialReturnerTag) {
      // Add serial returner tag
      await (supabase as any)
        .from('customers')
        .update({
          tags: [...tags, 'serial_returner'],
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId);

      // Generate alert
      await generateFraudAlert(
        merchantId,
        null,
        customerId,
        'serial_returner',
        'high',
        `Customer flagged as serial returner (${cust.return_rate.toFixed(1)}% return rate, ${cust.total_returns}/${cust.total_orders} orders)`,
        {
          return_rate: cust.return_rate,
          total_orders: cust.total_orders,
          total_returns: cust.total_returns,
        }
      );

      console.log(`[Fraud Engine] Flagged customer ${customerId} as serial returner`);
    } else if (!isSerialReturner && hasSerialReturnerTag) {
      // Remove tag if no longer meets criteria
      await (supabase as any)
        .from('customers')
        .update({
          tags: tags.filter((t: string) => t !== 'serial_returner'),
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId);

      console.log(`[Fraud Engine] Removed serial returner tag from customer ${customerId}`);
    }
  } catch (error) {
    console.error('[Fraud Engine] Error checking serial returner:', error);
  }
}
