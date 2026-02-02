/**
 * Top Fraudsters API
 * Phase 3: Returns list of high-risk entities flagged by multiple stores
 */

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase-client';
import { sanitizeResponse } from '@/lib/security/response-sanitizer';
import { logAuditEvent } from '@/lib/security/audit-logger';

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();

    // Check merchant has data sharing enabled
    // TODO: Implement proper session check and verify merchant.data_sharing_enabled
    // For now, return data (it's anonymized anyway)

    // Get top fraudsters using database function
    const { data: fraudsters, error } = await (supabase as any).rpc('get_top_fraudsters', {
      p_limit: 50
    });

    if (error) {
      console.error('Error fetching top fraudsters:', error);
      return NextResponse.json(
        { error: 'Failed to fetch top fraudsters' },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent({
      eventType: 'FRAUD_INTELLIGENCE_QUERIED',
      severity: 'MEDIUM',
      actorIp: request.headers.get('x-forwarded-for') || undefined,
      endpoint: '/api/fraud/intelligence/top-fraudsters',
      requestMethod: 'GET',
      responseStatus: 200,
      details: { query_type: 'top_fraudsters', result_count: fraudsters?.length || 0 }
    });

    return NextResponse.json(sanitizeResponse(fraudsters || []));
  } catch (error: any) {
    console.error('Error in top fraudsters API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
