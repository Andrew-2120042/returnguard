/**
 * Scope Audit API
 * Phase 3: Allows merchants to verify their Shopify scopes
 *
 * Returns current scopes and validates against allowed scopes
 */

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase-client';
import { validateShopifyScopes } from '@/lib/security/scope-validator';
import { sanitizeResponse } from '@/lib/security/response-sanitizer';
import { logAuditEvent } from '@/lib/security/audit-logger';
import { decryptToken } from '@/lib/crypto';

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();

    // Get session/merchant ID from request (implement your auth check here)
    // For security, you should verify the session before allowing scope audit
    // TODO: Add proper session verification

    // For this example, we'll require merchant_id as a query parameter
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get('merchant_id');

    if (!merchantId) {
      return NextResponse.json(
        { error: 'Missing merchant_id parameter' },
        { status: 400 }
      );
    }

    // Fetch merchant with encrypted token
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, shop_domain, access_token_encrypted, access_token_iv, access_token_auth_tag')
      .eq('id', merchantId)
      .eq('is_active', true)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json(
        { error: 'Merchant not found or inactive' },
        { status: 404 }
      );
    }

    const merch = merchant as any;

    // Decrypt access token (server-side only)
    if (
      !merch.access_token_encrypted ||
      !merch.access_token_iv ||
      !merch.access_token_auth_tag
    ) {
      return NextResponse.json(
        { error: 'Access token not available' },
        { status: 500 }
      );
    }

    const accessToken = decryptToken(
      merch.access_token_encrypted,
      merch.access_token_iv,
      merch.access_token_auth_tag,
      merchantId
    );

    // Validate scopes
    const validation = await validateShopifyScopes(accessToken, merch.shop_domain);

    // Log audit event
    await logAuditEvent({
      merchantId: merch.id,
      eventType: 'SCOPE_VALIDATION_FAILED',
      severity: validation.valid ? 'LOW' : 'HIGH',
      actorIp: request.headers.get('x-forwarded-for') || undefined,
      endpoint: '/api/security/audit-scopes',
      requestMethod: 'GET',
      responseStatus: 200,
      details: {
        valid: validation.valid,
        unauthorized_scopes: validation.unauthorized_scopes,
        missing_scopes: validation.missing_required_scopes
      }
    });

    const response = {
      valid: validation.valid,
      current_scopes: validation.current_scopes,
      unauthorized_scopes: validation.unauthorized_scopes,
      missing_required_scopes: validation.missing_required_scopes,
      shop_domain: merch.shop_domain,
      last_checked: new Date().toISOString(),
      message: validation.valid
        ? 'All scopes are valid and secure'
        : 'Invalid or unauthorized scopes detected'
    };

    return NextResponse.json(sanitizeResponse(response));
  } catch (error: any) {
    console.error('Error in scope audit API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}
