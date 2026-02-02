/**
 * Admin Security Dashboard API
 * Phase 3: Returns security incidents and audit logs for admin monitoring
 *
 * CRITICAL: Admin-only endpoint - requires ADMIN_API_KEY
 */

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase-client';
import { sanitizeResponse } from '@/lib/security/response-sanitizer';

export async function GET(request: Request) {
  try {
    // Verify admin authentication
    const authHeader = request.headers.get('X-Admin-Key');
    const expectedAuth = process.env.ADMIN_API_KEY;

    if (!expectedAuth || authHeader !== expectedAuth) {
      console.error('Unauthorized admin dashboard access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    // Get unresolved security incidents
    const { data: incidents, error: incidentsError } = await supabase
      .from('security_incidents')
      .select('*')
      .is('resolved_at', null)
      .order('severity', { ascending: false })
      .order('detected_at', { ascending: false })
      .limit(50);

    if (incidentsError) {
      console.error('Error fetching security incidents:', incidentsError);
    }

    // Get recent critical audit logs (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: criticalLogs, error: logsError } = await supabase
      .from('security_audit_logs')
      .select('*')
      .eq('severity', 'CRITICAL')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    if (logsError) {
      console.error('Error fetching critical logs:', logsError);
    }

    // Get merchants with most anomalies (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: merchantAnomalies, error: anomaliesError } = await supabase
      .from('security_incidents')
      .select('merchant_id, shop_domain, COUNT(*) as incident_count')
      .is('resolved_at', null)
      .gte('detected_at', thirtyDaysAgo)
      .order('incident_count', { ascending: false })
      .limit(20);

    if (anomaliesError) {
      console.error('Error fetching merchant anomalies:', anomaliesError);
    }

    // Calculate summary statistics
    const summary = {
      total_incidents: incidents?.length || 0,
      critical_count: incidents?.filter((i: any) => i.severity === 'CRITICAL').length || 0,
      high_count: incidents?.filter((i: any) => i.severity === 'HIGH').length || 0,
      medium_count: incidents?.filter((i: any) => i.severity === 'MEDIUM').length || 0,
      critical_logs_7d: criticalLogs?.length || 0,
      merchants_at_risk: merchantAnomalies?.length || 0
    };

    const response = {
      summary,
      unresolved_incidents: incidents || [],
      critical_logs: criticalLogs || [],
      merchants_at_risk: merchantAnomalies || [],
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(sanitizeResponse(response));
  } catch (error: any) {
    console.error('Error in admin security dashboard API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}
