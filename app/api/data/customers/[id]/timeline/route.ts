/**
 * Customer Timeline API
 * Returns unified orders + returns timeline for a customer
 *
 * ISSUE #4 FIX: Unified API endpoint with pagination
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getCustomerTimeline } from '@/lib/supabase-client';
import { calculatePagination } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

    const customerId = params.id;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get timeline
    const { data: timeline, count } = await getCustomerTimeline(customerId, {
      page,
      limit,
    });

    // Calculate pagination
    const pagination = calculatePagination(page, limit, count);

    return NextResponse.json({
      success: true,
      data: timeline,
      pagination,
    });
  } catch (error: any) {
    console.error('Get customer timeline error:', error);
    return NextResponse.json(
      { error: 'Failed to get customer timeline', details: error.message },
      { status: 500 }
    );
  }
}
