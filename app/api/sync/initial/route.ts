/**
 * Initial Sync Route
 * Triggers historical data sync (last 12 months)
 * Uses atomic progress updates (ISSUE #3) and resume capability (ISSUE #10)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { runInitialSync } from '@/lib/sync-engine';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    console.log(`Starting initial sync for merchant ${session.merchant_id}`);

    // Run initial sync (async - this may take several minutes)
    // In production, you'd want to run this in a background job
    // For now, we'll run it directly
    const result = await runInitialSync(session.merchant_id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Initial sync error:', error);
    return NextResponse.json(
      { error: 'Initial sync failed', details: error.message },
      { status: 500 }
    );
  }
}
