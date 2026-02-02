/**
 * Risk Scoring Engine
 * Phase 2: Calculates overall risk score (0-100) from fraud signals
 *
 * Takes all 12 fraud signals and:
 * 1. Sums weighted scores
 * 2. Normalizes to 0-100 scale
 * 3. Determines risk level (low/medium/high)
 * 4. Returns complete analysis
 */

import { calculateAllFraudSignals } from './fraud-signals';
import type { RiskAnalysis, FraudSignalResult } from './types';

// Maximum possible score from all signals
const MAX_POSSIBLE_SCORE = 200; // Sum of all max_score values

/**
 * Calculate risk score for a return
 *
 * @param returnId - Return ID
 * @param customerId - Customer ID
 * @param orderId - Order ID
 * @param merchantId - Merchant ID
 * @returns Complete risk analysis
 */
export async function calculateRiskScore(
  returnId: string,
  customerId: string,
  orderId: string,
  merchantId: string
): Promise<Omit<RiskAnalysis, 'action_taken' | 'action_reason'>> {
  // Calculate all 12 fraud signals
  const signals = await calculateAllFraudSignals(
    returnId,
    customerId,
    orderId,
    merchantId
  );

  // Sum up all signal scores
  const totalScore = signals.reduce((sum, signal) => sum + signal.score, 0);

  // Normalize to 0-100 scale
  const normalizedScore = Math.min(
    Math.round((totalScore / MAX_POSSIBLE_SCORE) * 100),
    100
  );

  // Determine risk level
  const riskLevel = determineRiskLevel(normalizedScore);

  // Return analysis
  return {
    return_id: returnId,
    customer_id: customerId,
    merchant_id: merchantId,
    risk_score: normalizedScore,
    risk_level: riskLevel,
    signals,
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Determine risk level from score
 *
 * @param score - Risk score (0-100)
 * @returns Risk level
 */
export function determineRiskLevel(
  score: number
): 'low' | 'medium' | 'high' {
  if (score <= 30) {
    return 'low';
  } else if (score <= 60) {
    return 'medium';
  } else {
    return 'high';
  }
}

/**
 * Get triggered signals (for display purposes)
 *
 * @param signals - Array of fraud signals
 * @returns Only signals that were triggered
 */
export function getTriggeredSignals(
  signals: FraudSignalResult[]
): FraudSignalResult[] {
  return signals.filter((signal) => signal.triggered);
}

/**
 * Get top contributing signals (for analytics)
 *
 * @param signals - Array of fraud signals
 * @param limit - Number of top signals to return
 * @returns Top signals by score
 */
export function getTopContributingSignals(
  signals: FraudSignalResult[],
  limit: number = 5
): FraudSignalResult[] {
  return [...signals]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Format risk analysis for display
 *
 * @param analysis - Risk analysis
 * @returns Human-readable summary
 */
export function formatRiskAnalysis(analysis: RiskAnalysis): {
  summary: string;
  recommendation: string;
  key_factors: string[];
} {
  const triggeredSignals = getTriggeredSignals(analysis.signals);
  const topSignals = getTopContributingSignals(analysis.signals, 3);

  // Generate summary
  let summary = `Risk Score: ${analysis.risk_score}/100 (${analysis.risk_level.toUpperCase()})`;

  if (triggeredSignals.length > 0) {
    summary += ` - ${triggeredSignals.length} fraud signals triggered`;
  } else {
    summary += ` - No major fraud signals detected`;
  }

  // Generate recommendation
  let recommendation = '';
  if (analysis.risk_level === 'low') {
    recommendation = 'Low risk. Safe to approve return automatically.';
  } else if (analysis.risk_level === 'medium') {
    recommendation =
      'Medium risk. Review recommended before processing return.';
  } else {
    recommendation =
      'High risk. Manual review required or consider blocking return.';
  }

  // Key factors
  const key_factors = topSignals
    .filter((s) => s.score > 0)
    .map((s) => `${s.signal_name}: ${s.details}`);

  return {
    summary,
    recommendation,
    key_factors,
  };
}

/**
 * Calculate risk score breakdown by category
 *
 * @param signals - Array of fraud signals
 * @returns Score breakdown by category
 */
export function getRiskBreakdown(signals: FraudSignalResult[]): {
  customer_history: number;
  order_characteristics: number;
  timing_patterns: number;
  cross_store: number;
} {
  // Group signals by category
  const customerHistory = signals
    .filter((s) => [1, 2, 3, 4, 5, 6, 10].includes(s.signal_id))
    .reduce((sum, s) => sum + s.score, 0);

  const orderCharacteristics = signals
    .filter((s) => [7, 9, 11].includes(s.signal_id))
    .reduce((sum, s) => sum + s.score, 0);

  const timingPatterns = signals
    .filter((s) => s.signal_id === 8)
    .reduce((sum, s) => sum + s.score, 0);

  const crossStore = signals
    .filter((s) => s.signal_id === 12)
    .reduce((sum, s) => sum + s.score, 0);

  return {
    customer_history: customerHistory,
    order_characteristics: orderCharacteristics,
    timing_patterns: timingPatterns,
    cross_store: crossStore,
  };
}

/**
 * Check if return should be automatically blocked
 * Based on critical signals
 *
 * @param signals - Array of fraud signals
 * @returns True if should auto-block
 */
export function shouldAutoBlock(signals: FraudSignalResult[]): boolean {
  // Auto-block criteria:
  // 1. Signal #6 (Serial Returner Label) is triggered
  // 2. Signal #11 (Incomplete Return) is triggered AND score > 70
  // 3. 5 or more signals triggered AND score > 80

  const serialReturner = signals.find((s) => s.signal_id === 6);
  const incompleteReturn = signals.find((s) => s.signal_id === 11);
  const triggeredCount = signals.filter((s) => s.triggered).length;
  const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
  const normalizedScore = Math.round((totalScore / MAX_POSSIBLE_SCORE) * 100);

  // Check criteria
  if (serialReturner?.triggered) {
    return true;
  }

  if (incompleteReturn?.triggered && normalizedScore > 70) {
    return true;
  }

  if (triggeredCount >= 5 && normalizedScore > 80) {
    return true;
  }

  return false;
}

/**
 * Generate risk explanation for customer-facing message
 * (Sanitized version without revealing detection methods)
 *
 * @param analysis - Risk analysis
 * @returns Customer-safe explanation
 */
export function generateCustomerExplanation(
  analysis: RiskAnalysis
): string {
  if (analysis.risk_level === 'low') {
    return 'Your return has been approved and will be processed shortly.';
  }

  if (analysis.risk_level === 'medium') {
    return 'Your return is under review. Our team will contact you within 24 hours.';
  }

  // High risk - generic message
  return 'We need additional information to process your return. Please contact customer support.';
}
