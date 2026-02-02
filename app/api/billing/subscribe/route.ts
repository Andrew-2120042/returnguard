/**
 * Create Shopify Recurring Charge
 * Initiates billing flow for plan upgrade
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { createRecurringCharge } from '@/lib/billing';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Parse request body
    const { plan } = await request.json();

    if (!plan || !['professional', 'business', 'enterprise'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be: professional, business, or enterprise' },
        { status: 400 }
      );
    }

    // Generate return URL (callback after charge approval)
    const returnUrl = `${process.env.SHOPIFY_APP_URL}/api/billing/callback?plan=${plan}`;

    // Create recurring charge
    const { confirmationUrl, chargeId } = await createRecurringCharge(
      session.merchant_id,
      plan,
      returnUrl
    );

    return NextResponse.json({
      success: true,
      confirmationUrl,
      chargeId,
    });
  } catch (error: any) {
    console.error('Create subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription', details: error.message },
      { status: 500 }
    );
  }
}
