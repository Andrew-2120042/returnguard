/**
 * Webhook Registration Route
 * Manually trigger webhook registration (for testing/debugging)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { registerWebhooksForMerchant } from '@/lib/webhook-manager';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    console.log(`Registering webhooks for merchant ${session.merchant_id}`);

    // Register webhooks
    await registerWebhooksForMerchant(session.merchant_id);

    return NextResponse.json({
      success: true,
      message: 'Webhooks registered successfully',
    });
  } catch (error: any) {
    console.error('Webhook registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register webhooks', details: error.message },
      { status: 500 }
    );
  }
}
