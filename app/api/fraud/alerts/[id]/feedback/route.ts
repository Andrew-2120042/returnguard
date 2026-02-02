import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { requireAuth } from '@/lib/session';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    const session = await requireAuth();

    // Get request body
    const { feedback, reason } = await request.json();

    // Validate feedback
    if (!['accurate', 'false_positive', 'not_sure'].includes(feedback)) {
      return NextResponse.json(
        { error: 'Invalid feedback value' },
        { status: 400 }
      );
    }

    // Update fraud alert with feedback
    const { error } = await (supabase as any)
      .from('fraud_alerts')
      .update({
        merchant_feedback: feedback,
        merchant_feedback_reason: reason || null,
        merchant_feedback_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .eq('merchant_id', session.merchant_id); // Ensure merchant can only update their own alerts

    if (error) {
      console.error('Feedback update error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error: any) {
    console.error('Feedback submission error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
