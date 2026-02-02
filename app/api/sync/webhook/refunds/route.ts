/**
 * Refunds Webhook Route
 * Handles refunds/create webhook from Shopify
 *
 * ISSUE #2 FIX: Always return 200 OK, check quota AFTER storing
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHMAC } from '@/lib/utils';
import {
  getMerchantByShopDomain,
  isOverQuota,
  incrementReturnsUsage,
} from '@/lib/supabase-client';
import { syncRefund } from '@/lib/sync-engine';
import { analyzeFraudForReturn } from '@/lib/fraud-engine';
import { supabase } from '@/lib/supabase-client';
import type { ShopifyRefund } from '@/lib/types';
import { logAuditEvent } from '@/lib/security/audit-logger';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC verification
    const body = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      // ISSUE #2: Still return 200 OK
      console.error('Missing HMAC header');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Verify HMAC
    const isValid = verifyWebhookHMAC(
      body,
      hmacHeader,
      process.env.SHOPIFY_API_SECRET!
    );

    if (!isValid) {
      // ISSUE #2: Still return 200 OK
      console.error('Invalid HMAC signature');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Parse webhook payload
    const refund: ShopifyRefund = JSON.parse(body);

    // Get shop domain from webhook payload (not headers)
    // Shopify includes shop domain in the webhook body
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    if (!shopDomain) {
      console.error('Missing shop domain');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Get merchant
    const merchant = await getMerchantByShopDomain(shopDomain);

    if (!merchant) {
      console.error(`Merchant not found: ${shopDomain}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Log webhook received
    await logAuditEvent({
      merchantId: merchant.id,
      eventType: 'WEBHOOK_RECEIVED',
      severity: 'LOW',
      actorIp: request.headers.get('x-forwarded-for') || undefined,
      endpoint: '/api/sync/webhook/refunds',
      requestMethod: 'POST',
      responseStatus: 200,
      details: {
        webhook_type: 'refunds/create',
        refund_id: refund.id,
        shop_domain: shopDomain
      }
    });

    // ISSUE #2 FIX: Store refund FIRST (always accept webhook)
    const returnId = await syncRefund(merchant.id, refund);

    console.log(`Refund synced: ${refund.id} (return_id: ${returnId}) for merchant ${merchant.id}`);

    // Check quota AFTER storing
    const overQuota = await isOverQuota(merchant.id);

    if (overQuota) {
      // Over quota: DON'T increment counter, skip fraud detection, send email
      console.warn(
        `Merchant ${merchant.id} is over quota. Refund stored but not counted.`
      );

      // Fraud detection is skipped when over quota
      // TODO: Send email notification to merchant about quota exceeded

      // Still return 200 OK
      return NextResponse.json(
        { received: true, quota_exceeded: true },
        { status: 200 }
      );
    }

    // Under quota: increment counter, trigger fraud detection
    await incrementReturnsUsage(merchant.id);

    console.log(`Returns usage incremented for merchant ${merchant.id}`);

    // Trigger fraud detection (Phase 2)
    if (returnId) {
      // Get return record to check for customer_id and order_id
      const { data: returnRecord } = await supabase
        .from('returns')
        .select('customer_id, order_id')
        .eq('id', returnId)
        .single();

      const record = returnRecord as any;
      if (record?.customer_id && record?.order_id) {
        // Run fraud analysis asynchronously (don't block webhook response)
        analyzeFraudForReturn(
          returnId,
          record.customer_id,
          record.order_id,
          merchant.id
        ).catch((error) => {
          console.error(`Fraud analysis failed for return ${returnId}:`, error);
        });

        console.log(`Fraud analysis queued for return ${returnId}`);
      } else {
        console.warn(
          `Skipping fraud analysis for return ${returnId}: missing customer_id or order_id`
        );
      }
    }

    // ISSUE #2: Always return 200 OK
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    // ISSUE #2: Even on error, return 200 OK
    console.error('Refunds webhook error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
