/**
 * GET /api/data/fraud-signals - Get fraud signal details for a return
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase-client';
import { getTriggeredSignals, getTopContributingSignals } from '@/lib/risk-scoring';

export async function GET(request: NextRequest) {
  try {
    // Verify session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const returnId = searchParams.get('return_id');
    const customerId = searchParams.get('customer_id');

    if (!returnId && !customerId) {
      return NextResponse.json(
        { error: 'Missing return_id or customer_id' },
        { status: 400 }
      );
    }

    // Fetch signals by return ID
    if (returnId) {
      const { data: returnRecord, error } = await supabase
        .from('returns')
        .select('id, fraud_signals, risk_score, risk_level, action_taken, action_reason')
        .eq('id', returnId)
        .eq('merchant_id', session.merchant_id)
        .single();

      if (error || !returnRecord) {
        return NextResponse.json(
          { error: 'Return not found' },
          { status: 404 }
        );
      }

      const signals = (returnRecord as any).fraud_signals as any[] || [];
      const triggeredSignals = getTriggeredSignals(signals);
      const topSignals = getTopContributingSignals(signals, 5);

      const record = returnRecord as any;
      return NextResponse.json({
        success: true,
        return_id: record.id,
        risk_score: record.risk_score,
        risk_level: record.risk_level,
        action_taken: record.action_taken,
        action_reason: record.action_reason,
        all_signals: signals,
        triggered_signals: triggeredSignals,
        top_contributing_signals: topSignals,
      });
    }

    // Fetch signals by customer ID (aggregated across all returns)
    if (customerId) {
      const { data: returns, error } = await supabase
        .from('returns')
        .select('id, fraud_signals, risk_score, created_at')
        .eq('customer_id', customerId)
        .eq('merchant_id', session.merchant_id)
        .not('fraud_signals', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch customer signals' },
          { status: 500 }
        );
      }

      // Aggregate signal triggers across all returns
      const signalAggregation = new Map<
        number,
        {
          signal_name: string;
          trigger_count: number;
          total_score: number;
          max_score: number;
        }
      >();

      returns?.forEach((returnRecord: any) => {
        const signals = returnRecord.fraud_signals as any[];
        signals?.forEach((signal: any) => {
          const existing = signalAggregation.get(signal.signal_id) || {
            signal_name: signal.signal_name,
            trigger_count: 0,
            total_score: 0,
            max_score: signal.max_score,
          };

          signalAggregation.set(signal.signal_id, {
            signal_name: signal.signal_name,
            trigger_count: existing.trigger_count + (signal.triggered ? 1 : 0),
            total_score: existing.total_score + signal.score,
            max_score: signal.max_score,
          });
        });
      });

      // Format aggregated signals
      const aggregatedSignals = Array.from(signalAggregation.entries())
        .map(([id, data]) => ({
          signal_id: id,
          signal_name: data.signal_name,
          trigger_count: data.trigger_count,
          avg_score: Math.round(data.total_score / (returns?.length || 1)),
          max_score: data.max_score,
          trigger_rate: ((data.trigger_count / (returns?.length || 1)) * 100).toFixed(1),
        }))
        .sort((a, b) => b.trigger_count - a.trigger_count);

      return NextResponse.json({
        success: true,
        customer_id: customerId,
        total_returns_analyzed: returns?.length || 0,
        aggregated_signals: aggregatedSignals,
        recent_returns: returns?.map((r: any) => ({
          return_id: r.id,
          risk_score: r.risk_score,
          created_at: r.created_at,
        })),
      });
    }

    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in fraud-signals API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
