/**
 * Shopify billing integration with activation polling
 * ISSUE #5 FIX: Poll charge status until 'active'
 */

import {
  getMerchantById,
  updateMerchant,
  getBillingPlans,
} from './supabase-client';
import { createShopifyClient } from './shopify-client';
import { sleep, getEnvVar } from './utils';
import type { BillingPlan } from './types';

/**
 * Create a Shopify recurring charge
 *
 * @param merchantId - Merchant ID
 * @param planName - Plan name (professional, business, enterprise)
 * @param returnUrl - URL to redirect after approval
 * @returns Confirmation URL for merchant to approve charge
 */
export async function createRecurringCharge(
  merchantId: string,
  planName: 'professional' | 'business' | 'enterprise',
  returnUrl: string
): Promise<{ confirmationUrl: string; chargeId: string }> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  // Get billing plans
  const plans = await getBillingPlans();
  const plan = plans.find((p) => p.plan_name === planName);

  if (!plan) {
    throw new Error(`Plan ${planName} not found`);
  }

  // Create Shopify client
  const client = await createShopifyClient(
    merchant.shop_domain,
    merchant.access_token_encrypted,
    merchant.access_token_iv,
    merchant.access_token_auth_tag,
    merchant.id
  );

  // Create recurring charge
  const result = await client.createRecurringCharge({
    name: plan.display_name,
    price: plan.price_monthly,
    returnUrl,
    test: process.env.NODE_ENV !== 'production', // Test charges in development
  });

  return result;
}

/**
 * Poll charge status until active
 * ISSUE #5 FIX: Async activation requires polling
 *
 * @param merchantId - Merchant ID
 * @param chargeId - Charge ID from Shopify
 * @param maxAttempts - Max polling attempts (default 10)
 * @param intervalMs - Polling interval in ms (default 1000)
 * @returns True if activated, false if failed
 */
export async function waitForChargeActivation(
  merchantId: string,
  chargeId: string,
  maxAttempts: number = 10,
  intervalMs: number = 1000
): Promise<boolean> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  const client = await createShopifyClient(
    merchant.shop_domain,
    merchant.access_token_encrypted,
    merchant.access_token_iv,
    merchant.access_token_auth_tag,
    merchant.id
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const charge = await client.getRecurringCharge(chargeId);

      console.log(
        `Charge ${chargeId} status: ${charge.status} (attempt ${attempt + 1}/${maxAttempts})`
      );

      if (charge.status === 'ACTIVE') {
        return true;
      }

      if (charge.status === 'DECLINED' || charge.status === 'CANCELLED') {
        return false;
      }

      // Status is PENDING, wait and retry
      if (attempt < maxAttempts - 1) {
        await sleep(intervalMs);
      }
    } catch (error) {
      console.error(`Error checking charge status:`, error);
      if (attempt < maxAttempts - 1) {
        await sleep(intervalMs);
      }
    }
  }

  // Max attempts reached, charge didn't activate
  return false;
}

/**
 * Activate subscription plan
 * Called after charge is approved and activated
 *
 * @param merchantId - Merchant ID
 * @param planName - Plan name
 * @param chargeId - Shopify charge ID
 */
export async function activateSubscription(
  merchantId: string,
  planName: 'professional' | 'business' | 'enterprise',
  chargeId: string
): Promise<void> {
  // Get plan details
  const plans = await getBillingPlans();
  const plan = plans.find((p) => p.plan_name === planName);

  if (!plan) {
    throw new Error(`Plan ${planName} not found`);
  }

  // Update merchant
  await updateMerchant(merchantId, {
    plan: planName,
    returns_quota: plan.returns_quota === -1 ? 999999 : plan.returns_quota, // -1 = unlimited
    shopify_charge_id: chargeId,
    billing_cycle_start: new Date().toISOString(),
    returns_used_this_month: 0, // Reset usage
  });
}

/**
 * Cancel subscription
 *
 * @param merchantId - Merchant ID
 */
export async function cancelSubscription(merchantId: string): Promise<void> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  if (!merchant.shopify_charge_id) {
    throw new Error('No active subscription found');
  }

  // Create Shopify client
  const client = await createShopifyClient(
    merchant.shop_domain,
    merchant.access_token_encrypted,
    merchant.access_token_iv,
    merchant.access_token_auth_tag,
    merchant.id
  );

  // Cancel charge in Shopify
  await client.cancelRecurringCharge(merchant.shopify_charge_id);

  // Downgrade to free plan
  await updateMerchant(merchantId, {
    plan: 'free',
    returns_quota: 5,
    shopify_charge_id: undefined,
    returns_used_this_month: 0,
  });
}

/**
 * Check if merchant has exceeded quota
 *
 * @param merchantId - Merchant ID
 * @returns True if over quota
 */
export async function checkQuota(merchantId: string): Promise<boolean> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    return true; // Treat as over quota
  }

  // Enterprise has unlimited
  if (merchant.plan === 'enterprise') {
    return false;
  }

  return merchant.returns_used_this_month >= merchant.returns_quota;
}

/**
 * Get billing info for merchant
 *
 * @param merchantId - Merchant ID
 * @returns Billing info
 */
export async function getBillingInfo(merchantId: string): Promise<{
  plan: string;
  quota: number;
  used: number;
  percentage: number;
  isOverQuota: boolean;
}> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  const isOverQuota = merchant.plan !== 'enterprise' &&
    merchant.returns_used_this_month >= merchant.returns_quota;

  const percentage = merchant.plan === 'enterprise'
    ? 0
    : (merchant.returns_used_this_month / merchant.returns_quota) * 100;

  return {
    plan: merchant.plan,
    quota: merchant.returns_quota,
    used: merchant.returns_used_this_month,
    percentage: Math.min(percentage, 100),
    isOverQuota,
  };
}

/**
 * Get available plans with features
 *
 * @returns Array of billing plans
 */
export async function getAvailablePlans(): Promise<BillingPlan[]> {
  return await getBillingPlans();
}
