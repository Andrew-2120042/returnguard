/**
 * Billing Callback Route
 * Handles charge approval callback from Shopify
 *
 * ISSUE #5 FIX: Poll charge status until 'active'
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { waitForChargeActivation, activateSubscription } from '@/lib/billing';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const chargeId = searchParams.get('charge_id');
    const plan = searchParams.get('plan');

    if (!chargeId) {
      return NextResponse.redirect(
        `${process.env.SHOPIFY_APP_URL}/dashboard?error=missing_charge_id`
      );
    }

    if (!plan || !['professional', 'business', 'enterprise'].includes(plan)) {
      return NextResponse.redirect(
        `${process.env.SHOPIFY_APP_URL}/dashboard?error=invalid_plan`
      );
    }

    console.log(`Waiting for charge activation: ${chargeId}`);

    // ISSUE #5 FIX: Poll charge status until 'active' (max 10 attempts, 1s interval)
    const isActivated = await waitForChargeActivation(
      session.merchant_id,
      chargeId,
      10,
      1000
    );

    if (!isActivated) {
      console.error(`Charge ${chargeId} failed to activate`);
      return NextResponse.redirect(
        `${process.env.SHOPIFY_APP_URL}/dashboard?error=charge_not_activated`
      );
    }

    console.log(`Charge ${chargeId} activated successfully`);

    // Activate subscription in our database
    await activateSubscription(
      session.merchant_id,
      plan as 'professional' | 'business' | 'enterprise',
      chargeId
    );

    console.log(`Subscription activated for merchant ${session.merchant_id}`);

    // Redirect to dashboard with success message
    return NextResponse.redirect(
      `${process.env.SHOPIFY_APP_URL}/dashboard?success=subscription_activated&plan=${plan}`
    );
  } catch (error: any) {
    console.error('Billing callback error:', error);
    return NextResponse.redirect(
      `${process.env.SHOPIFY_APP_URL}/dashboard?error=activation_failed&details=${encodeURIComponent(error.message)}`
    );
  }
}
