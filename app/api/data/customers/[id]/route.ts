/**
 * Customer Detail API
 * Returns single customer with full details
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getCustomerById } from '@/lib/supabase-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

    const customerId = params.id;

    // Get customer
    const customer = await getCustomerById(customerId);

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: customer,
    });
  } catch (error: any) {
    console.error('Get customer error:', error);
    return NextResponse.json(
      { error: 'Failed to get customer', details: error.message },
      { status: 500 }
    );
  }
}
