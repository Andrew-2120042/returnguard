/**
 * Customers List API
 * Returns paginated list of customers with search/sort
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getCustomersByMerchant } from '@/lib/supabase-client';
import { calculatePagination } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'return_rate';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Get customers
    const { data: customers, count } = await getCustomersByMerchant(
      session.merchant_id,
      {
        page,
        limit,
        search,
        sortBy,
        sortOrder,
      }
    );

    // Calculate pagination
    const pagination = calculatePagination(page, limit, count);

    return NextResponse.json({
      success: true,
      data: customers,
      pagination,
    });
  } catch (error: any) {
    console.error('Get customers error:', error);
    return NextResponse.json(
      { error: 'Failed to get customers', details: error.message },
      { status: 500 }
    );
  }
}
