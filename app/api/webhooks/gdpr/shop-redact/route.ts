/**
 * GDPR: Shop Redact Webhook
 * Required for Shopify App Store approval
 *
 * Deletes all merchant data when app is uninstalled
 * After 30 days (in case merchant reinstalls)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHMAC } from '@/lib/utils';
import { getMerchantByShopDomain, updateMerchant } from '@/lib/supabase-client';

export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC verification
    const body = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    if (!hmacHeader) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Verify HMAC
    const isValid = verifyWebhookHMAC(
      body,
      hmacHeader,
      process.env.SHOPIFY_API_SECRET!
    );

    if (!isValid) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Parse payload
    const payload = JSON.parse(body);
    const shopDomain = payload.shop_domain;

    if (!shopDomain) {
      console.error('Missing shop domain');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Get merchant
    const merchant = await getMerchantByShopDomain(shopDomain);

    if (!merchant) {
      console.log(`Merchant not found: ${shopDomain}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Mark merchant as inactive and uninstalled
    // Don't delete immediately (merchant might reinstall)
    await updateMerchant(merchant.id, {
      is_active: false,
      uninstalled_at: new Date().toISOString(),
    });

    console.log(
      `GDPR shop redaction processed for shop ${shopDomain}. Merchant marked inactive.`
    );

    // TODO: Schedule data deletion after 30 days
    // In production, use a cron job to delete merchants where:
    // uninstalled_at < NOW() - INTERVAL '30 days' AND is_active = false

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('GDPR shop redact error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
