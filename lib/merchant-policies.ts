/**
 * Merchant Policies
 * Phase 2: Default policies and policy management
 *
 * Provides default fraud policies for new merchants and utilities
 * for managing policy configuration
 */

import { supabase } from './supabase-client';
import type { MerchantPolicy } from './types';

/**
 * Default policies for new merchants
 * Applied automatically when merchant installs the app
 */
export const DEFAULT_POLICIES = [
  {
    policy_type: 'auto_approve' as const,
    min_risk_score: 0,
    max_risk_score: 30,
    actions: {
      approve_return: true,
      process_refund: true,
      send_alert: false,
    },
    description: 'Low risk returns are automatically approved',
  },
  {
    policy_type: 'flag_review' as const,
    min_risk_score: 31,
    max_risk_score: 60,
    actions: {
      require_review: true,
      send_alert: true,
      send_email: false,
      slack_notification: false,
    },
    description: 'Medium risk returns are flagged for manual review',
  },
  {
    policy_type: 'auto_block' as const,
    min_risk_score: 61,
    max_risk_score: 100,
    actions: {
      block_return: true,
      send_alert: true,
      require_override: true,
      send_email: true,
      slack_notification: true,
    },
    description: 'High risk returns are automatically blocked',
  },
];

/**
 * Apply default policies to merchant
 * Called during OAuth callback or first login
 *
 * @param merchantId - Merchant ID
 * @returns Success status
 */
export async function applyDefaultPolicies(
  merchantId: string
): Promise<boolean> {
  try {
    // Check if policies already exist
    const { data: existingPolicies, error: fetchError } = await supabase
      .from('merchant_policies')
      .select('id')
      .eq('merchant_id', merchantId)
      .limit(1);

    if (fetchError) {
      console.error('Error checking existing policies:', fetchError);
      return false;
    }

    // Skip if policies already exist
    if (existingPolicies && existingPolicies.length > 0) {
      console.log(`Policies already exist for merchant ${merchantId}`);
      return true;
    }

    // Insert default policies
    const policiesToInsert = DEFAULT_POLICIES.map((policy) => ({
      merchant_id: merchantId,
      policy_type: policy.policy_type,
      min_risk_score: policy.min_risk_score,
      max_risk_score: policy.max_risk_score,
      actions: policy.actions,
      is_active: true,
    }));

    const { error: insertError } = await (supabase as any)
      .from('merchant_policies')
      .insert(policiesToInsert);

    if (insertError) {
      console.error('Error inserting default policies:', insertError);
      return false;
    }

    console.log(`Applied ${DEFAULT_POLICIES.length} default policies to merchant ${merchantId}`);
    return true;
  } catch (error) {
    console.error('Error applying default policies:', error);
    return false;
  }
}

/**
 * Get all policies for merchant
 *
 * @param merchantId - Merchant ID
 * @param activeOnly - Return only active policies
 * @returns Merchant policies
 */
export async function getMerchantPolicies(
  merchantId: string,
  activeOnly: boolean = false
): Promise<MerchantPolicy[]> {
  let query = supabase
    .from('merchant_policies')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('min_risk_score', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data: policies, error } = await query;

  if (error) {
    console.error('Error fetching merchant policies:', error);
    return [];
  }

  return policies || [];
}

/**
 * Get single policy by ID
 *
 * @param policyId - Policy ID
 * @returns Policy or null
 */
export async function getPolicy(
  policyId: string
): Promise<MerchantPolicy | null> {
  const { data: policy, error } = await supabase
    .from('merchant_policies')
    .select('*')
    .eq('id', policyId)
    .single();

  if (error) {
    console.error('Error fetching policy:', error);
    return null;
  }

  return policy;
}

/**
 * Update merchant policy
 *
 * @param policyId - Policy ID
 * @param updates - Fields to update
 * @returns Updated policy
 */
export async function updatePolicy(
  policyId: string,
  updates: Partial<MerchantPolicy>
): Promise<MerchantPolicy | null> {
  const { data: policy, error } = await (supabase as any)
    .from('merchant_policies')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', policyId)
    .select()
    .single();

  if (error) {
    console.error('Error updating policy:', error);
    return null;
  }

  return policy;
}

/**
 * Create custom policy
 *
 * @param merchantId - Merchant ID
 * @param policyData - Policy configuration
 * @returns Created policy
 */
export async function createPolicy(
  merchantId: string,
  policyData: {
    policy_type: 'auto_approve' | 'flag_review' | 'auto_block';
    min_risk_score: number;
    max_risk_score: number;
    actions: any;
  }
): Promise<MerchantPolicy | null> {
  const { data: policy, error } = await (supabase as any)
    .from('merchant_policies')
    .insert({
      merchant_id: merchantId,
      ...policyData,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating policy:', error);
    return null;
  }

  return policy;
}

/**
 * Delete policy
 *
 * @param policyId - Policy ID
 * @returns Success status
 */
export async function deletePolicy(policyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('merchant_policies')
    .delete()
    .eq('id', policyId);

  if (error) {
    console.error('Error deleting policy:', error);
    return false;
  }

  return true;
}

/**
 * Toggle policy active status
 *
 * @param policyId - Policy ID
 * @param isActive - New active status
 * @returns Success status
 */
export async function togglePolicyStatus(
  policyId: string,
  isActive: boolean
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('merchant_policies')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', policyId);

  if (error) {
    console.error('Error toggling policy status:', error);
    return false;
  }

  return true;
}

/**
 * Validate policy configuration
 * Ensures no overlapping risk score ranges
 *
 * @param merchantId - Merchant ID
 * @param policyData - Policy to validate
 * @param excludePolicyId - Policy ID to exclude from overlap check (for updates)
 * @returns Validation result
 */
export async function validatePolicy(
  merchantId: string,
  policyData: {
    min_risk_score: number;
    max_risk_score: number;
  },
  excludePolicyId?: string
): Promise<{ valid: boolean; error?: string }> {
  // Check for valid range
  if (policyData.min_risk_score < 0 || policyData.max_risk_score > 100) {
    return {
      valid: false,
      error: 'Risk score must be between 0 and 100',
    };
  }

  if (policyData.min_risk_score > policyData.max_risk_score) {
    return {
      valid: false,
      error: 'Minimum risk score cannot be greater than maximum',
    };
  }

  // Check for overlaps with existing policies
  let query = supabase
    .from('merchant_policies')
    .select('id, min_risk_score, max_risk_score, policy_type')
    .eq('merchant_id', merchantId)
    .eq('is_active', true);

  if (excludePolicyId) {
    query = query.neq('id', excludePolicyId);
  }

  const { data: existingPolicies, error } = await query;

  if (error) {
    return {
      valid: false,
      error: 'Failed to validate policy',
    };
  }

  // Check for overlapping ranges
  for (const existing of (existingPolicies || []) as any[]) {
    const overlaps =
      (policyData.min_risk_score >= existing.min_risk_score &&
        policyData.min_risk_score <= existing.max_risk_score) ||
      (policyData.max_risk_score >= existing.min_risk_score &&
        policyData.max_risk_score <= existing.max_risk_score) ||
      (policyData.min_risk_score <= existing.min_risk_score &&
        policyData.max_risk_score >= existing.max_risk_score);

    if (overlaps) {
      return {
        valid: false,
        error: `Risk score range overlaps with existing ${existing.policy_type} policy (${existing.min_risk_score}-${existing.max_risk_score})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Get policy coverage
 * Returns percentage of risk score range (0-100) covered by active policies
 *
 * @param merchantId - Merchant ID
 * @returns Coverage percentage
 */
export async function getPolicyCoverage(
  merchantId: string
): Promise<number> {
  const { data: policies, error } = await supabase
    .from('merchant_policies')
    .select('min_risk_score, max_risk_score')
    .eq('merchant_id', merchantId)
    .eq('is_active', true);

  if (error || !policies || policies.length === 0) {
    return 0;
  }

  // Create array of covered scores
  const covered = new Set<number>();

  for (const policy of (policies as any[])) {
    for (
      let score = policy.min_risk_score;
      score <= policy.max_risk_score;
      score++
    ) {
      covered.add(score);
    }
  }

  // Calculate coverage (0-100 = 101 possible scores)
  return Math.round((covered.size / 101) * 100);
}

/**
 * Reset policies to default
 * Deactivates all current policies and applies defaults
 *
 * @param merchantId - Merchant ID
 * @returns Success status
 */
export async function resetToDefaultPolicies(
  merchantId: string
): Promise<boolean> {
  try {
    // Deactivate all existing policies
    const { error: deactivateError } = await (supabase as any)
      .from('merchant_policies')
      .update({ is_active: false })
      .eq('merchant_id', merchantId);

    if (deactivateError) {
      console.error('Error deactivating policies:', deactivateError);
      return false;
    }

    // Apply default policies
    return await applyDefaultPolicies(merchantId);
  } catch (error) {
    console.error('Error resetting policies:', error);
    return false;
  }
}
