/**
 * Sync Status Route
 * Returns current sync progress for merchant
 * Used by dashboard to poll progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getMerchantById } from '@/lib/supabase-client';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Get merchant
    const merchant = await getMerchantById(session.merchant_id);

    if (!merchant) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    // Return sync progress
    return NextResponse.json({
      success: true,
      sync_status: merchant.sync_status,
      sync_progress: merchant.sync_progress,
      orders_synced_count: merchant.orders_synced_count,
      sync_total_orders: merchant.sync_total_orders,
      last_sync_at: merchant.last_sync_at,
      webhooks_registered: merchant.webhooks_registered,
    });
  } catch (error: any) {
    console.error('Sync status error:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status', details: error.message },
      { status: 500 }
    );
  }
}
