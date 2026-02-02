/**
 * GDPR: Customer Redact Webhook
 * Required for Shopify App Store approval
 *
 * Deletes all customer data from our database
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHMAC } from '@/lib/utils';
import { getMerchantByShopDomain, getCustomersByMerchant } from '@/lib/supabase-client';
import { supabase } from '@/lib/supabase-client';

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
    const customerId = payload.customer?.id?.toString();

    if (!shopDomain || !customerId) {
      console.error('Missing shop domain or customer ID');
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Get merchant
    const merchant = await getMerchantByShopDomain(shopDomain);

    if (!merchant) {
      console.log(`Merchant not found: ${shopDomain}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Find customer
    const { data: customers } = await getCustomersByMerchant(merchant.id, {
      limit: 1000,
    });

    const customer = customers.find(
      (c) => c.shopify_customer_id === customerId
    );

    if (!customer) {
      console.log(`Customer not found: ${customerId}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Delete customer data (cascades to orders, returns, fraud_signals)
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customer.id);

    if (error) {
      console.error('Error deleting customer:', error);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    console.log(
      `GDPR customer redaction processed for customer ${customerId} in shop ${shopDomain}`
    );

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('GDPR customer redact error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
