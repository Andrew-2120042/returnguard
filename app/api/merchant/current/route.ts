/**
 * Get Current Merchant API
 * Returns merchant data for the authenticated session
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMerchantById } from '@/lib/supabase-client';
import { sanitizeResponse } from '@/lib/security/response-sanitizer';

export async function GET(request: Request) {
  try {
    // Get current session
    const session = await getSession();

    if (!session || !session.merchant_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch merchant data
    const merchant = await getMerchantById(session.merchant_id);

    if (!merchant) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    // Sanitize response to remove sensitive data
    return NextResponse.json(sanitizeResponse(merchant));
  } catch (error: any) {
    console.error('Error in GET /api/merchant/current:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
