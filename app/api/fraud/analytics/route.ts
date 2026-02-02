/**
 * GET /api/fraud/analytics - Get fraud analytics and statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getFraudStatistics } from '@/lib/fraud-engine';
import { supabase } from '@/lib/supabase-client';

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
    const days = parseInt(searchParams.get('days') || '30');
    const type = searchParams.get('type') || 'overview';

    // Get fraud statistics
    const stats = await getFraudStatistics(session.merchant_id, days);

    // Get additional analytics based on type
    if (type === 'overview') {
      return NextResponse.json({
        success: true,
        analytics: stats,
        period_days: days,
      });
    }

    if (type === 'signals') {
      // Get top triggered signals
      const { data: returns } = await supabase
        .from('returns')
        .select('fraud_signals')
        .eq('merchant_id', session.merchant_id)
        .not('fraud_signals', 'is', null)
        .gte(
          'created_at',
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        );

      // Aggregate signal data
      const signalStats = new Map<
        string,
        { count: number; total_score: number; signal_name: string }
      >();

      returns?.forEach((returnRecord: any) => {
        const signals = returnRecord.fraud_signals as any[];
        signals?.forEach((signal: any) => {
          if (signal.triggered) {
            const existing = signalStats.get(signal.signal_id.toString()) || {
              count: 0,
              total_score: 0,
              signal_name: signal.signal_name,
            };
            signalStats.set(signal.signal_id.toString(), {
              count: existing.count + 1,
              total_score: existing.total_score + signal.score,
              signal_name: signal.signal_name,
            });
          }
        });
      });

      // Format top signals
      const topSignals = Array.from(signalStats.entries())
        .map(([id, data]) => ({
          signal_id: parseInt(id),
          signal_name: data.signal_name,
          trigger_count: data.count,
          avg_score: Math.round(data.total_score / data.count),
        }))
        .sort((a, b) => b.trigger_count - a.trigger_count)
        .slice(0, 10);

      return NextResponse.json({
        success: true,
        top_signals: topSignals,
        period_days: days,
      });
    }

    if (type === 'trend') {
      // Get savings trend (blocked returns value over time)
      const { data: returns } = await supabase
        .from('returns')
        .select('created_at, return_value, action_taken')
        .eq('merchant_id', session.merchant_id)
        .eq('action_taken', 'blocked')
        .gte(
          'created_at',
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        )
        .order('created_at', { ascending: true });

      // Group by day
      const trendData = new Map<string, number>();

      returns?.forEach((returnRecord: any) => {
        const date = new Date(returnRecord.created_at).toISOString().split('T')[0];
        const existing = trendData.get(date) || 0;
        trendData.set(date, existing + returnRecord.return_value);
      });

      const savingsTrend = Array.from(trendData.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return NextResponse.json({
        success: true,
        savings_trend: savingsTrend,
        period_days: days,
      });
    }

    if (type === 'customers') {
      // Get top risky customers
      const { data: customers } = await supabase
        .from('customers')
        .select('id, email, first_name, last_name, risk_score, risk_level, total_returns, return_rate')
        .eq('merchant_id', session.merchant_id)
        .in('risk_level', ['high', 'critical'])
        .order('risk_score', { ascending: false })
        .limit(20);

      return NextResponse.json({
        success: true,
        high_risk_customers: customers || [],
      });
    }

    if (type === 'actions') {
      // Get action distribution
      const { data: returns } = await supabase
        .from('returns')
        .select('action_taken')
        .eq('merchant_id', session.merchant_id)
        .not('action_taken', 'is', null)
        .gte(
          'created_at',
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        );

      const actionCounts = {
        approved: 0,
        flagged: 0,
        blocked: 0,
        pending: 0,
      };

      returns?.forEach((returnRecord: any) => {
        const action = returnRecord.action_taken as keyof typeof actionCounts;
        if (action in actionCounts) {
          actionCounts[action]++;
        }
      });

      return NextResponse.json({
        success: true,
        action_distribution: actionCounts,
        total_returns: returns?.length || 0,
        period_days: days,
      });
    }

    // Invalid type
    return NextResponse.json(
      { error: 'Invalid type. Use: overview, signals, trend, customers, actions' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in analytics API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
