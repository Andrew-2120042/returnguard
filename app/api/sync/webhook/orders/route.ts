/**
 * Orders Webhook Route
 * Handles orders/create webhook from Shopify
 *
 * ISSUE #2 FIX: Always return 200 OK (never 403)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHMAC } from '@/lib/utils';
import { getMerchantByShopDomain } from '@/lib/supabase-client';
import { syncOrder } from '@/lib/sync-engine';
import type { ShopifyOrder } from '@/lib/types';
import { logAuditEvent } from '@/lib/security/audit-logger';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC verification
    const body = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      // ISSUE #2: Still return 200 OK (log error internally)
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
      // ISSUE #2: Still return 200 OK (log error internally)
      console.error('Invalid HMAC signature');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Parse webhook payload
    const order: ShopifyOrder = JSON.parse(body);
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    if (!shopDomain) {
      // ISSUE #2: Still return 200 OK
      console.error('Missing shop domain header');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Get merchant
    const merchant = await getMerchantByShopDomain(shopDomain);

    if (!merchant) {
      // ISSUE #2: Still return 200 OK (merchant might have uninstalled)
      console.error(`Merchant not found: ${shopDomain}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Log webhook received
    await logAuditEvent({
      merchantId: merchant.id,
      eventType: 'WEBHOOK_RECEIVED',
      severity: 'LOW',
      actorIp: request.headers.get('x-forwarded-for') || undefined,
      endpoint: '/api/sync/webhook/orders',
      requestMethod: 'POST',
      responseStatus: 200,
      details: {
        webhook_type: 'orders/create',
        order_id: order.id,
        shop_domain: shopDomain
      }
    });

    // Sync order
    await syncOrder(merchant.id, order);

    console.log(`Order synced: ${order.id} for merchant ${merchant.id}`);

    // ISSUE #2: Always return 200 OK
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    // ISSUE #2: Even on error, return 200 OK
    console.error('Orders webhook error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
