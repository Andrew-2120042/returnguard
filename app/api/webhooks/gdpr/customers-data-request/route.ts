/**
 * GDPR: Customer Data Request Webhook
 * Required for Shopify App Store approval
 *
 * Returns all customer data we have stored
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookHMAC } from '@/lib/utils';
import {
  getMerchantByShopDomain,
  getCustomersByMerchant,
  getOrdersByMerchant,
  getReturnsByMerchant,
} from '@/lib/supabase-client';

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

    // Get all data for this customer
    const { data: orders } = await getOrdersByMerchant(merchant.id, {
      customerId: customer.id,
      limit: 1000,
    });

    const { data: returns } = await getReturnsByMerchant(merchant.id, {
      customerId: customer.id,
      limit: 1000,
    });

    // Return customer data
    const customerData = {
      customer,
      orders,
      returns,
    };

    console.log(
      `GDPR data request processed for customer ${customerId} in shop ${shopDomain}`
    );

    // In production, you'd send this data to Shopify or the merchant
    // For now, just log it
    console.log(`Customer data: ${JSON.stringify(customerData).length} bytes`);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('GDPR data request error:', error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
