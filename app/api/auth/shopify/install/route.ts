/**
 * OAuth Install Route
 * Initiates Shopify OAuth flow
 *
 * Usage: /api/auth/shopify/install?shop=yourstore.myshopify.com
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthUrl } from '@/lib/shopify-client';
import { normalizeShopDomain, generateRandomString } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json(
        { error: 'Missing shop parameter' },
        { status: 400 }
      );
    }

    // Normalize shop domain
    const shopDomain = normalizeShopDomain(shop);

    // Generate state for CSRF protection
    const state = generateRandomString(32);

    // Generate OAuth URL
    const authUrl = generateAuthUrl(shopDomain, state);

    // Store state in cookie for verification (optional, but recommended)
    const response = NextResponse.redirect(authUrl);
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error: any) {
    console.error('OAuth install error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth', details: error.message },
      { status: 500 }
    );
  }
}
