/**
 * Token Isolation Layer
 * Phase 3: Ensures access tokens NEVER leave the server
 *
 * CRITICAL RULES:
 * - Access tokens NEVER sent to client
 * - Access tokens NEVER logged
 * - Access tokens NEVER exposed in API responses
 * - All Shopify API requests go through this layer
 */

import { getSupabaseClient } from '@/lib/supabase-client';
import { decryptToken } from '@/lib/crypto';

export interface ShopifyRequestOptions {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  apiVersion?: string;
}

/**
 * Make a Shopify API request with secure token handling
 * Token NEVER leaves the server or gets exposed to the client
 *
 * @param merchantId - Merchant ID
 * @param options - Request options
 * @returns API response data (without sensitive fields)
 */
export async function makeShopifyRequest(
  merchantId: string,
  options: ShopifyRequestOptions
): Promise<{ data: any; error?: string }> {
  try {
    const supabase = getSupabaseClient();

    // 1. Fetch merchant server-side only
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('shop_domain, access_token_encrypted, access_token_iv, access_token_auth_tag')
      .eq('id', merchantId)
      .eq('is_active', true)
      .single();

    if (merchantError || !merchant) {
      return { data: null, error: 'Merchant not found or inactive' };
    }

    const merch = merchant as any;

    if (
      !merch.access_token_encrypted ||
      !merch.access_token_iv ||
      !merch.access_token_auth_tag
    ) {
      return { data: null, error: 'Access token not available' };
    }

    // 2. Decrypt token server-side only
    const accessToken = decryptToken(
      merch.access_token_encrypted,
      merch.access_token_iv,
      merch.access_token_auth_tag,
      merchantId
    );

    // 3. Make Shopify API request
    const apiVersion = options.apiVersion || '2024-01';
    const url = `https://${merch.shop_domain}/admin/api/${apiVersion}/${options.endpoint}`;

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      return {
        data: null,
        error: `Shopify API error: ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();

    // 4. NEVER return the token in the response
    // The data is already safe since it comes from Shopify API
    return { data };
  } catch (error: any) {
    console.error('Error in makeShopifyRequest:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Get merchant's Shopify access token (server-side only)
 * USE WITH EXTREME CAUTION - Token should never leave this function
 *
 * @param merchantId - Merchant ID
 * @returns Decrypted access token or null
 */
export async function getAccessToken(merchantId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: merchant, error } = await supabase
      .from('merchants')
      .select('access_token_encrypted, access_token_iv, access_token_auth_tag')
      .eq('id', merchantId)
      .eq('is_active', true)
      .single();

    if (error || !merchant) {
      return null;
    }

    const merch = merchant as any;

    if (
      !merch.access_token_encrypted ||
      !merch.access_token_iv ||
      !merch.access_token_auth_tag
    ) {
      return null;
    }

    // Decrypt token
    const accessToken = decryptToken(
      merch.access_token_encrypted,
      merch.access_token_iv,
      merch.access_token_auth_tag,
      merchantId
    );

    return accessToken;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

/**
 * Validate that an object doesn't contain sensitive token data
 * Used before sending data to the client
 *
 * @param data - Data to validate
 * @returns True if safe to send to client
 */
export function validateNoTokenExposure(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return true;
  }

  const dataStr = JSON.stringify(data).toLowerCase();

  // Check for common token patterns
  const SENSITIVE_PATTERNS = [
    'access_token',
    'api_key',
    'api_secret',
    'shopify_access_token',
    'x-shopify-access-token',
    'bearer',
    'authorization'
  ];

  for (const pattern of SENSITIVE_PATTERNS) {
    if (dataStr.includes(pattern)) {
      console.error('🚨 SECURITY ALERT: Attempted to expose sensitive token data');
      return false;
    }
  }

  return true;
}
