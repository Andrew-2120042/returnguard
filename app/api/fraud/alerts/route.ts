/**
 * GET /api/fraud/alerts - Get fraud alerts for merchant
 * POST /api/fraud/alerts - Mark alerts as read/acknowledged
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getUnreadAlerts,
  markAlertAsRead,
  acknowledgeAlert,
  getAlertStatistics,
} from '@/lib/fraud-alerts';
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
    const unreadOnly = searchParams.get('unread_only') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const type = searchParams.get('type'); // 'statistics' or default
    const severity = searchParams.get('severity');

    // Return statistics
    if (type === 'statistics') {
      const stats = await getAlertStatistics(session.merchant_id);
      return NextResponse.json({
        success: true,
        statistics: stats,
      });
    }

    // Build query
    let query = supabase
      .from('fraud_alerts')
      .select('*')
      .eq('merchant_id', session.merchant_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching alerts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch alerts' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alerts: alerts || [],
      count: alerts?.length || 0,
    });
  } catch (error) {
    console.error('Error in GET alerts API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const { alert_id, action, acknowledged_by } = body;

    if (!alert_id) {
      return NextResponse.json(
        { error: 'Missing alert_id' },
        { status: 400 }
      );
    }

    // Verify alert belongs to merchant
    const { data: alert, error: fetchError } = await supabase
      .from('fraud_alerts')
      .select('id, merchant_id')
      .eq('id', alert_id)
      .single();

    if (fetchError || !alert) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    if ((alert as any).merchant_id !== session.merchant_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    let success = false;

    // Perform action
    switch (action) {
      case 'mark_read':
        success = await markAlertAsRead(alert_id);
        break;

      case 'acknowledge':
        if (!acknowledged_by) {
          return NextResponse.json(
            { error: 'Missing acknowledged_by' },
            { status: 400 }
          );
        }
        success = await acknowledgeAlert(alert_id, acknowledged_by);
        break;

      case 'mark_all_read':
        // Mark all unread alerts as read
        const { error: updateError } = await (supabase as any)
          .from('fraud_alerts')
          .update({ is_read: true })
          .eq('merchant_id', session.merchant_id)
          .eq('is_read', false);

        success = !updateError;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: mark_read, acknowledge, mark_all_read' },
          { status: 400 }
        );
    }

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update alert' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Alert ${action} successful`,
    });
  } catch (error) {
    console.error('Error in POST alerts API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
