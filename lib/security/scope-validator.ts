/**
 * Shopify Scope Validator
 * Phase 3: Prevents Disputifier-style breaches
 *
 * CRITICAL: Ensures app never gets write access to sensitive data
 */

import { supabase } from '../supabase-client';
import { logSecurityIncident } from './audit-logger';

/**
 * ONLY these scopes are allowed
 * NEVER request write access to orders, refunds, customers, products
 */
export const ALLOWED_SCOPES = [
  'read_orders',
  'read_customers',
  'read_refunds',
  'write_webhooks',
] as const;

/**
 * FORBIDDEN scopes that indicate security breach
 * If ANY of these are detected, immediately revoke access
 */
export const FORBIDDEN_SCOPES = [
  'write_refunds', // CRITICAL: This caused Disputifier breach
  'write_orders',
  'write_customers',
  'write_products',
  'write_price_rules',
  'write_draft_orders',
  'write_payment_gateways',
  'write_inventory',
  'write_fulfillments',
  'write_shipping',
  'write_checkouts',
] as const;

export interface ScopeValidationResult {
  valid: boolean;
  current_scopes: string[];
  unauthorized_scopes: string[];
  missing_required_scopes: string[];
  error?: string;
}

/**
 * Validate Shopify access scopes
 * Called during OAuth and periodically via cron
 *
 * @param accessToken - Shopify access token
 * @param shopDomain - Shop domain
 * @returns Validation result
 */
export async function validateShopifyScopes(
  accessToken: string,
  shopDomain: string
): Promise<ScopeValidationResult> {
  try {
    // Query Shopify API for current access scopes
    const response = await fetch(
      `https://${shopDomain}/admin/oauth/access_scopes.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return {
        valid: false,
        current_scopes: [],
        unauthorized_scopes: [],
        missing_required_scopes: [],
        error: `Failed to fetch scopes: ${response.status}`,
      };
    }

    const data = await response.json();
    const currentScopes: string[] = data.access_scopes.map(
      (scope: any) => scope.handle
    );

    // Check for forbidden scopes
    const unauthorizedScopes = currentScopes.filter((scope) =>
      FORBIDDEN_SCOPES.includes(scope as any)
    );

    if (unauthorizedScopes.length > 0) {
      // CRITICAL SECURITY BREACH
      console.error(
        `🚨 SECURITY ALERT: Forbidden scopes detected for ${shopDomain}:`,
        unauthorizedScopes
      );

      // Log critical security incident
      await logSecurityIncident({
        type: 'FORBIDDEN_SCOPE_DETECTED',
        severity: 'CRITICAL',
        shopDomain,
        description: `Forbidden scopes detected: ${unauthorizedScopes.join(', ')}`,
        details: {
          current_scopes: currentScopes,
          unauthorized_scopes: unauthorizedScopes,
        },
      });

      // Revoke access immediately
      await revokeShopifyAccess(shopDomain);

      return {
        valid: false,
        current_scopes: currentScopes,
        unauthorized_scopes: unauthorizedScopes,
        missing_required_scopes: [],
        error: 'Forbidden scopes detected. Access revoked for security.',
      };
    }

    // Check for missing required scopes
    const missingRequiredScopes = ALLOWED_SCOPES.filter(
      (scope) => !currentScopes.includes(scope)
    );

    if (missingRequiredScopes.length > 0) {
      console.warn(
        `Missing required scopes for ${shopDomain}:`,
        missingRequiredScopes
      );

      return {
        valid: false,
        current_scopes: currentScopes,
        unauthorized_scopes: [],
        missing_required_scopes: missingRequiredScopes,
        error: `Missing required scopes: ${missingRequiredScopes.join(', ')}`,
      };
    }

    // All scopes valid
    return {
      valid: true,
      current_scopes: currentScopes,
      unauthorized_scopes: [],
      missing_required_scopes: [],
    };
  } catch (error: any) {
    console.error('Error validating scopes:', error);
    return {
      valid: false,
      current_scopes: [],
      unauthorized_scopes: [],
      missing_required_scopes: [],
      error: error.message,
    };
  }
}

/**
 * Revoke Shopify access for security breach
 *
 * @param shopDomain - Shop domain to revoke
 */
export async function revokeShopifyAccess(
  shopDomain: string
): Promise<boolean> {
  try {
    console.log(`🚨 Revoking access for ${shopDomain} due to security breach`);

    // Get merchant
    const { data: merchant, error: fetchError } = await supabase
      .from('merchants')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single();

    if (fetchError || !merchant) {
      console.error('Merchant not found:', shopDomain);
      return false;
    }

    const merch = merchant as any;

    // Mark merchant as inactive and delete access token
    const { error: updateError } = await (supabase as any)
      .from('merchants')
      .update({
        is_active: false,
        access_token_encrypted: undefined,
        access_token_iv: undefined,
        access_token_auth_tag: undefined,
        uninstalled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', merch.id);

    if (updateError) {
      console.error('Error revoking access:', updateError);
      return false;
    }

    // Log security incident
    await logSecurityIncident({
      type: 'ACCESS_REVOKED',
      severity: 'CRITICAL',
      merchantId: merch.id,
      shopDomain,
      description: 'Access revoked due to forbidden scope detection',
      details: {
        reason: 'FORBIDDEN_SCOPE_DETECTED',
        action: 'ACCESS_REVOKED',
      },
    });

    // TODO: Send email to merchant explaining revocation
    // TODO: Send alert to admin

    console.log(`✅ Access revoked for ${shopDomain}`);
    return true;
  } catch (error: any) {
    console.error('Error in revokeShopifyAccess:', error);
    return false;
  }
}

/**
 * Validate scopes during OAuth installation
 * Checks requested scopes match allowed scopes
 *
 * @param requestedScopes - Scopes being requested
 * @returns True if valid
 */
export function validateRequestedScopes(requestedScopes: string): boolean {
  const scopes = requestedScopes.split(',').map((s) => s.trim());

  // Check for any forbidden scopes
  const hasForbiddenScopes = scopes.some((scope) =>
    FORBIDDEN_SCOPES.includes(scope as any)
  );

  if (hasForbiddenScopes) {
    console.error('🚨 CRITICAL: Attempted to request forbidden scopes');
    return false;
  }

  // Check that all requested scopes are in allowed list
  const allAllowed = scopes.every((scope) =>
    ALLOWED_SCOPES.includes(scope as any)
  );

  if (!allAllowed) {
    console.warn('Requested scopes contain non-allowed scopes:', scopes);
    return false;
  }

  return true;
}

/**
 * Get expected scopes string for OAuth
 * Always returns the same allowed scopes
 *
 * @returns Comma-separated scope string
 */
export function getExpectedScopes(): string {
  return ALLOWED_SCOPES.join(',');
}
