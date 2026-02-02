/**
 * Orders List API
 * Returns paginated list of orders
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getOrdersByMerchant } from '@/lib/supabase-client';
import { calculatePagination } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const customerId = searchParams.get('customerId') || undefined;

    // Get orders
    const { data: orders, count } = await getOrdersByMerchant(
      session.merchant_id,
      {
        page,
        limit,
        customerId,
      }
    );

    // Calculate pagination
    const pagination = calculatePagination(page, limit, count);

    return NextResponse.json({
      success: true,
      data: orders,
      pagination,
    });
  } catch (error: any) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: 'Failed to get orders', details: error.message },
      { status: 500 }
    );
  }
}
