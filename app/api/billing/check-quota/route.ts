/**
 * Check Quota Route
 * Returns current quota usage for merchant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getBillingInfo } from '@/lib/billing';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Get billing info
    const billingInfo = await getBillingInfo(session.merchant_id);

    return NextResponse.json({
      success: true,
      ...billingInfo,
    });
  } catch (error: any) {
    console.error('Check quota error:', error);
    return NextResponse.json(
      { error: 'Failed to check quota', details: error.message },
      { status: 500 }
    );
  }
}
