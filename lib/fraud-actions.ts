/**
 * Fraud Actions
 * Phase 2: Policy enforcement and action determination
 *
 * Applies merchant policies to risk scores and determines
 * what action to take (approve/flag/block)
 */

import { supabase } from './supabase-client';
import type { MerchantPolicy } from './types';

/**
 * Determine action based on risk score and merchant policies
 *
 * @param riskScore - Risk score (0-100)
 * @param merchantId - Merchant ID
 * @param returnId - Return ID
 * @returns Action to take and reason
 */
export async function determineAction(
  riskScore: number,
  merchantId: string,
  returnId: string
): Promise<{
  action: 'approved' | 'flagged' | 'blocked' | 'pending';
  reason: string;
  policy: MerchantPolicy | null;
}> {
  // Fetch active merchant policies
  const { data: policies, error } = await supabase
    .from('merchant_policies')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('is_active', true)
    .order('min_risk_score', { ascending: true });

  if (error || !policies || policies.length === 0) {
    // No policies found - default to pending
    return {
      action: 'pending',
      reason: 'No active fraud policies configured',
      policy: null,
    };
  }

  // Find matching policy for this risk score
  const matchingPolicy = policies.find(
    (policy: any) =>
      riskScore >= policy.min_risk_score && riskScore <= policy.max_risk_score
  );

  if (!matchingPolicy) {
    // Risk score doesn't match any policy
    return {
      action: 'pending',
      reason: `Risk score ${riskScore} does not match any policy range`,
      policy: null,
    };
  }

  const policy = matchingPolicy as any;

  // Determine action based on policy type
  let action: 'approved' | 'flagged' | 'blocked' | 'pending' = 'pending';
  let reason = '';

  switch (policy.policy_type) {
    case 'auto_approve':
      action = 'approved';
      reason = `Low risk (${riskScore}/100) - automatically approved per policy`;
      break;

    case 'flag_review':
      action = 'flagged';
      reason = `Medium risk (${riskScore}/100) - flagged for manual review`;
      break;

    case 'auto_block':
      action = 'blocked';
      reason = `High risk (${riskScore}/100) - automatically blocked per policy`;
      break;

    default:
      action = 'pending';
      reason = `Unknown policy type: ${policy.policy_type}`;
  }

  return {
    action,
    reason,
    policy,
  };
}

/**
 * Apply action to return record
 *
 * @param returnId - Return ID
 * @param action - Action to take
 * @param reason - Reason for action
 * @returns Success status
 */
export async function applyAction(
  returnId: string,
  action: 'approved' | 'flagged' | 'blocked' | 'pending',
  reason: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('returns')
    .update({
      action_taken: action,
      action_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', returnId);

  if (error) {
    console.error('Error applying action to return:', error);
    return false;
  }

  return true;
}

/**
 * Execute policy actions (send emails, create tasks, etc.)
 *
 * @param policy - Merchant policy
 * @param returnId - Return ID
 * @param merchantId - Merchant ID
 * @param action - Action taken
 */
export async function executePolicyActions(
  policy: MerchantPolicy,
  returnId: string,
  merchantId: string,
  action: string
): Promise<void> {
  const actions = policy.actions || {};

  // Send alert if configured
  if (actions.send_alert) {
    // Import dynamically to avoid circular dependency
    const { generateFraudAlert } = await import('./fraud-alerts');

    const severity =
      action === 'blocked'
        ? 'critical'
        : action === 'flagged'
          ? 'high'
          : 'medium';

    await generateFraudAlert(
      merchantId,
      returnId,
      null,
      'policy_violation',
      severity,
      `Return ${action} by fraud policy: ${policy.policy_type}`,
      { policy_id: policy.id, policy_type: policy.policy_type }
    );
  }

  // Send email notification if configured
  if (actions.send_email) {
    // TODO: Implement email notification
    console.log(`Email notification for return ${returnId}: ${action}`);
  }

  // Create Slack notification if configured
  if (actions.slack_notification) {
    // TODO: Implement Slack webhook
    console.log(`Slack notification for return ${returnId}: ${action}`);
  }

  // Require receipt if configured
  if (actions.require_receipt) {
    // TODO: Flag return as requiring receipt upload
    console.log(`Receipt required for return ${returnId}`);
  }

  // Require manager approval if configured
  if (actions.require_manager_approval) {
    // TODO: Create approval task
    console.log(`Manager approval required for return ${returnId}`);
  }
}

/**
 * Check if action can be overridden
 *
 * @param policy - Merchant policy
 * @returns True if override is allowed
 */
export function canOverrideAction(policy: MerchantPolicy | null): boolean {
  if (!policy) return true;

  const actions = policy.actions || {};
  return actions.require_override !== true;
}

/**
 * Override action (for manual review)
 *
 * @param returnId - Return ID
 * @param newAction - New action
 * @param reason - Reason for override
 * @param overriddenBy - User who performed override
 * @returns Success status
 */
export async function overrideAction(
  returnId: string,
  newAction: 'approved' | 'flagged' | 'blocked',
  reason: string,
  overriddenBy: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('returns')
    .update({
      action_taken: newAction,
      action_reason: `Manual override by ${overriddenBy}: ${reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', returnId);

  if (error) {
    console.error('Error overriding action:', error);
    return false;
  }

  return true;
}
