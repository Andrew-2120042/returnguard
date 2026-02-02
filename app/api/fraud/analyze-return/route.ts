/**
 * POST /api/fraud/analyze-return
 * Analyze a return for fraud and apply automated actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { analyzeFraudForReturn } from '@/lib/fraud-engine';
import { supabase } from '@/lib/supabase-client';

export async function POST(request: NextRequest) {
  try {
    // Verify session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { return_id } = body;

    if (!return_id) {
      return NextResponse.json(
        { error: 'Missing return_id' },
        { status: 400 }
      );
    }

    // Get return details
    const { data: returnRecord, error: returnError } = await supabase
      .from('returns')
      .select('id, customer_id, order_id, merchant_id')
      .eq('id', return_id)
      .eq('merchant_id', session.merchant_id)
      .single();

    if (returnError || !returnRecord) {
      return NextResponse.json(
        { error: 'Return not found' },
        { status: 404 }
      );
    }

    const record = returnRecord as any;

    // Verify return has required data
    if (!record.customer_id || !record.order_id) {
      return NextResponse.json(
        { error: 'Return missing customer_id or order_id' },
        { status: 400 }
      );
    }

    // Run fraud analysis
    const analysis = await analyzeFraudForReturn(
      record.id,
      record.customer_id,
      record.order_id,
      record.merchant_id
    );

    if (!analysis) {
      return NextResponse.json(
        { error: 'Failed to analyze return' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error in analyze-return API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
