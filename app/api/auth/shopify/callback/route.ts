/**
 * OAuth Callback Route
 * Handles Shopify OAuth callback
 *
 * ISSUE #1 FIX: Queue background jobs instead of blocking
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, ShopifyClient } from '@/lib/shopify-client';
import { encryptAccessToken } from '@/lib/crypto';
import { createSession } from '@/lib/session';
import { createMerchant, getMerchantByShopDomain } from '@/lib/supabase-client';
import { queueJob } from '@/lib/background-jobs';
import { verifyShopifyHMAC, normalizeShopDomain } from '@/lib/utils';
import type { OAuthCallbackParams } from '@/lib/types';
import { validateShopifyScopes } from '@/lib/security/scope-validator';
import { logAuditEvent, logSecurityIncident } from '@/lib/security/audit-logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract OAuth parameters
    const shop = searchParams.get('shop');
    const code = searchParams.get('code');
    const hmac = searchParams.get('hmac');
    const timestamp = searchParams.get('timestamp');
    const state = searchParams.get('state');

    if (!shop || !code || !hmac || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required OAuth parameters' },
        { status: 400 }
      );
    }

    // Normalize shop domain
    const shopDomain = normalizeShopDomain(shop);

    // Verify HMAC signature
    const params: Record<string, string> = {
      shop: shopDomain,
      code,
      timestamp,
    };

    if (state) {
      params.state = state;
    }

    const isValid = verifyShopifyHMAC(
      params,
      hmac,
      process.env.SHOPIFY_API_SECRET!
    );

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // Exchange code for access token
    console.log(`Exchanging code for access token: ${shopDomain}`);
    const accessToken = await exchangeCodeForToken(shopDomain, code);

    // CRITICAL SECURITY CHECK: Validate scopes before storing token
    console.log(`Validating scopes for ${shopDomain}...`);
    const scopeValidation = await validateShopifyScopes(accessToken, shopDomain);

    if (!scopeValidation.valid) {
      // Log critical security incident
      await logSecurityIncident({
        type: 'FORBIDDEN_SCOPE_DETECTED',
        severity: 'CRITICAL',
        shopDomain,
        description: `OAuth installation blocked: ${scopeValidation.error || 'Invalid scopes detected'}`,
        details: {
          unauthorized_scopes: scopeValidation.unauthorized_scopes,
          missing_scopes: scopeValidation.missing_required_scopes,
          current_scopes: scopeValidation.current_scopes
        }
      });

      console.error('🚨 SECURITY: Installation blocked due to invalid scopes');

      return NextResponse.json(
        {
          error: 'Installation blocked for security reasons',
          message: 'The requested permissions include forbidden scopes. Installation cannot proceed.',
          details: scopeValidation.error
        },
        { status: 403 }
      );
    }

    console.log('✅ Scope validation passed');

    // Get shop info
    const shopifyClient = new ShopifyClient(shopDomain, accessToken);
    const shopInfo = await shopifyClient.getShop();

    console.log(`Shop info retrieved: ${shopInfo.name}`);

    // Check if merchant already exists
    let merchant = await getMerchantByShopDomain(shopDomain);

    if (merchant) {
      // Merchant exists - this is a reinstall
      console.log(`Merchant exists, updating: ${merchant.id}`);

      // Encrypt new access token
      const encryptedData = encryptAccessToken(accessToken, merchant.id);

      // Update merchant (use updateMerchant from supabase-client)
      const { updateMerchant } = await import('@/lib/supabase-client');
      merchant = await updateMerchant(merchant.id, {
        ...encryptedData,
        shop_name: shopInfo.name,
        shop_email: shopInfo.email,
        shop_owner: shopInfo.shop_owner,
        shop_currency: shopInfo.currency,
        shop_timezone: shopInfo.iana_timezone,
        shopify_shop_id: shopInfo.id.toString(),
        is_active: true,
        uninstalled_at: undefined,
        webhooks_registered: false, // Will be re-registered
      });
    } else {
      // New merchant - create record
      console.log(`Creating new merchant: ${shopDomain}`);

      // Create merchant first to get ID
      const tempMerchant = await createMerchant({
        shop_domain: shopDomain,
        shopify_shop_id: shopInfo.id.toString(),
        shop_name: shopInfo.name,
        shop_email: shopInfo.email,
        shop_owner: shopInfo.shop_owner,
        shop_currency: shopInfo.currency,
        shop_timezone: shopInfo.iana_timezone,
        // Temporary placeholder for encrypted token
        access_token_encrypted: 'temp',
        access_token_iv: 'temp',
        access_token_auth_tag: 'temp',
        encryption_key_version: 1,
        plan: 'free',
        returns_quota: 5,
        returns_used_this_month: 0,
        sync_status: 'idle',
        sync_progress: 0,
        sync_total_orders: 0,
        orders_synced_count: 0,
        webhook_api_version: process.env.SHOPIFY_API_VERSION!,
        webhooks_registered: false,
        is_active: true,
      });

      // Now encrypt token with merchant ID
      const encryptedData = encryptAccessToken(accessToken, tempMerchant.id);

      // Update with encrypted token
      const { updateMerchant } = await import('@/lib/supabase-client');
      merchant = await updateMerchant(tempMerchant.id, encryptedData);
    }

    console.log(`Merchant saved: ${merchant.id}`);

    // ISSUE #1 FIX: Queue background jobs (non-blocking)
    // Instead of calling registerWebhooks and runInitialSync directly,
    // queue them as background jobs

    console.log('Queueing background jobs...');

    // Queue webhook registration
    const webhookJob = await queueJob(merchant.id, 'register-webhooks');
    console.log(`Webhook registration job queued: ${webhookJob.id}`);

    // Queue initial sync
    const syncJob = await queueJob(merchant.id, 'initial-sync');
    console.log(`Initial sync job queued: ${syncJob.id}`);

    // Create session
    await createSession(shopDomain, merchant.id);

    console.log('Session created, redirecting to dashboard...');

    // Redirect to dashboard with setup=pending parameter
    // Dashboard will show setup progress UI
    const dashboardUrl = `${process.env.SHOPIFY_APP_URL}/dashboard?setup=pending&webhook_job=${webhookJob.id}&sync_job=${syncJob.id}`;

    return NextResponse.redirect(dashboardUrl);
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return NextResponse.json(
      {
        error: 'OAuth callback failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
