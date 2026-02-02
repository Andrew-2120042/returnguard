/**
 * GET /api/settings/data-sharing - Get data sharing status
 * POST /api/settings/data-sharing - Toggle data sharing consent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase-client';
import { logAuditEvent } from '@/lib/security/audit-logger';

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

    // Get merchant data sharing settings
    const { data: merchant, error } = await supabase
      .from('merchants')
      .select('data_sharing_enabled, data_sharing_consent_at')
      .eq('id', session.merchant_id)
      .single();

    if (error || !merchant) {
      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      );
    }

    const merch = merchant as any;
    return NextResponse.json({
      success: true,
      data_sharing_enabled: merch.data_sharing_enabled,
      data_sharing_consent_at: merch.data_sharing_consent_at,
    });
  } catch (error) {
    console.error('Error in GET data-sharing API:', error);
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
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request. Provide "enabled" as boolean' },
        { status: 400 }
      );
    }

    // Update merchant data sharing settings
    const updateData: any = {
      data_sharing_enabled: enabled,
      updated_at: new Date().toISOString(),
    };

    // Set consent timestamp when enabling for the first time
    if (enabled) {
      updateData.data_sharing_consent_at = new Date().toISOString();
    }

    const { data: merchant, error } = await (supabase as any)
      .from('merchants')
      .update(updateData)
      .eq('id', session.merchant_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating data sharing settings:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent({
      merchantId: session.merchant_id,
      eventType: enabled ? 'DATA_SHARING_ENABLED' : 'DATA_SHARING_DISABLED',
      severity: 'MEDIUM',
      actorIp: request.headers.get('x-forwarded-for') || undefined,
      actorUserAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/settings/data-sharing',
      requestMethod: 'POST',
      responseStatus: 200,
      details: {
        data_sharing_enabled: enabled,
        action: enabled ? 'enabled' : 'disabled'
      }
    });

    // If enabling data sharing, trigger hash calculation for all customers
    if (enabled) {
      // This will be handled by the database trigger
      // calculate_customer_hashes() runs automatically on customer updates
      console.log(`[Data Sharing] Enabled for merchant ${session.merchant_id}`);

      // Optionally: Trigger batch hash calculation for existing customers
      const { error: updateError } = await (supabase as any).rpc('trigger_customer_hash_calculation', {
        p_merchant_id: session.merchant_id,
      });

      if (updateError) {
        console.error('Error triggering hash calculation:', updateError);
        // Don't fail the request - hashes will be calculated on next update
      }
    }

    return NextResponse.json({
      success: true,
      message: enabled
        ? 'Data sharing enabled. Cross-merchant fraud intelligence is now active.'
        : 'Data sharing disabled. Your data will not be shared with the fraud intelligence network.',
      data_sharing_enabled: merchant.data_sharing_enabled,
      data_sharing_consent_at: merchant.data_sharing_consent_at,
    });
  } catch (error) {
    console.error('Error in POST data-sharing API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
