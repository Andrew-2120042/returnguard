/**
 * Data sync engine with retry and resume logic
 * ISSUE #3: Atomic progress updates
 * ISSUE #10: Resume sync with last_synced_order_id
 */

import {
  getMerchantById,
  updateMerchant,
  incrementSyncProgress,
  upsertCustomer,
  batchInsertOrders,
  batchInsertReturns,
  updateCustomerStats,
  getSupabaseClient,
} from './supabase-client';
import { createShopifyClient } from './shopify-client';
import { chunk, calculateReturnRate, getRiskLevel } from './utils';
import type { ShopifyOrder, ShopifyRefund, SyncResult } from './types';

const BATCH_SIZE = 250; // Shopify max limit per request
const MONTHS_TO_SYNC = 12; // Sync last 12 months of data

/**
 * Run initial sync for a merchant
 * Pulls historical orders, customers, and returns
 *
 * @param merchantId - Merchant ID
 */
export async function runInitialSync(merchantId: string): Promise<SyncResult> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  console.log(`Starting initial sync for merchant ${merchantId}`);

  // Set sync status to 'syncing'
  await updateMerchant(merchantId, {
    sync_status: 'syncing',
    sync_progress: 0,
  });

  try {
    // Create Shopify client
    const client = await createShopifyClient(
      merchant.shop_domain,
      merchant.access_token_encrypted,
      merchant.access_token_iv,
      merchant.access_token_auth_tag,
      merchant.id
    );

    // Get total order count (last 12 months)
    const createdAtMin = new Date();
    createdAtMin.setMonth(createdAtMin.getMonth() - MONTHS_TO_SYNC);

    const totalOrders = await client.getOrdersCount({
      created_at_min: createdAtMin.toISOString(),
    });

    console.log(`Total orders to sync: ${totalOrders}`);

    // Update sync total
    await updateMerchant(merchantId, {
      sync_total_orders: totalOrders,
    });

    if (totalOrders === 0) {
      // No orders to sync
      await updateMerchant(merchantId, {
        sync_status: 'idle',
        sync_progress: 100,
        last_sync_at: new Date().toISOString(),
      });

      return {
        success: true,
        orders_processed: 0,
        customers_created: 0,
        returns_created: 0,
        errors: [],
      };
    }

    // Sync orders in batches
    let sinceId = merchant.last_synced_order_id || undefined;
    let ordersProcessed = 0;
    let customersCreated = 0;
    let returnsCreated = 0;
    const errors: string[] = [];

    while (true) {
      try {
        // Fetch batch of orders
        const orders = await client.getOrders({
          limit: BATCH_SIZE,
          since_id: sinceId,
          created_at_min: createdAtMin.toISOString(),
          status: 'any',
        });

        if (orders.length === 0) {
          break; // No more orders
        }

        console.log(`Processing batch of ${orders.length} orders`);

        // Process batch
        const batchResult = await processBatch(merchantId, orders);
        ordersProcessed += batchResult.orders_processed;
        customersCreated += batchResult.customers_created;
        returnsCreated += batchResult.returns_created;
        errors.push(...batchResult.errors);

        // Update last_synced_order_id for resume capability
        const lastOrderId = orders[orders.length - 1].id.toString();
        sinceId = lastOrderId;

        await updateMerchant(merchantId, {
          last_synced_order_id: lastOrderId,
        });

        // Update progress atomically (prevents race conditions)
        await incrementSyncProgress(merchantId, orders.length);

        console.log(`Progress: ${ordersProcessed}/${totalOrders} orders`);

        // If we got fewer than BATCH_SIZE, we're done
        if (orders.length < BATCH_SIZE) {
          break;
        }
      } catch (error: any) {
        console.error('Error processing batch:', error);
        errors.push(error.message);

        // Continue to next batch instead of failing entire sync
        if (sinceId) {
          continue;
        } else {
          throw error;
        }
      }
    }

    // Mark sync as complete
    await updateMerchant(merchantId, {
      sync_status: 'idle',
      sync_progress: 100,
      last_sync_at: new Date().toISOString(),
    });

    console.log(`Initial sync complete: ${ordersProcessed} orders, ${customersCreated} customers, ${returnsCreated} returns`);

    return {
      success: true,
      orders_processed: ordersProcessed,
      customers_created: customersCreated,
      returns_created: returnsCreated,
      errors,
    };
  } catch (error: any) {
    console.error('Initial sync failed:', error);

    // Mark sync as error
    await updateMerchant(merchantId, {
      sync_status: 'error',
    });

    throw error;
  }
}

/**
 * Process a batch of orders
 * Extracts customers, orders, and returns
 *
 * @param merchantId - Merchant ID
 * @param orders - Array of Shopify orders
 */
async function processBatch(
  merchantId: string,
  orders: ShopifyOrder[]
): Promise<{
  orders_processed: number;
  customers_created: number;
  returns_created: number;
  errors: string[];
}> {
  let customersCreated = 0;
  let returnsCreated = 0;
  const errors: string[] = [];

  // Extract and upsert customers
  const customerMap = new Map<string, any>();

  for (const order of orders) {
    if (order.customer && order.customer.id) {
      const customerId = order.customer.id.toString();

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          merchant_id: merchantId,
          shopify_customer_id: customerId,
          email: order.customer.email,
          first_name: order.customer.first_name,
          last_name: order.customer.last_name,
          phone: order.customer.phone,
          default_address: order.customer.default_address || null,
          accepts_marketing: order.customer.accepts_marketing,
          tags: order.customer.tags ? order.customer.tags.split(',') : [],
          status: order.customer.state as any,
          shopify_created_at: order.customer.created_at,
          shopify_updated_at: order.customer.updated_at,
        });
      }
    }
  }

  // Upsert customers
  for (const customerData of Array.from(customerMap.values())) {
    try {
      await upsertCustomer(customerData);
      customersCreated++;
    } catch (error: any) {
      errors.push(`Customer upsert failed: ${error.message}`);
    }
  }

  // Get customer IDs from database (for foreign key)
  const customerEmailToIdMap = new Map<string, string>();
  for (const order of orders) {
    if (order.customer?.email) {
      // Would need to query DB here to get customer.id
      // For simplicity, we'll handle this in the order insertion
    }
  }

  // Prepare orders for batch insert
  const ordersToInsert = orders.map((order) => ({
    merchant_id: merchantId,
    shopify_order_id: order.id.toString(),
    order_number: order.order_number.toString(),
    email: order.email,
    total_price: parseFloat(order.total_price),
    subtotal_price: order.subtotal_price ? parseFloat(order.subtotal_price) : undefined,
    total_tax: order.total_tax ? parseFloat(order.total_tax) : undefined,
    total_discounts: order.total_discounts ? parseFloat(order.total_discounts) : undefined,
    currency: order.currency,
    line_items: order.line_items,
    shipping_address: order.shipping_address || undefined,
    billing_address: order.billing_address || undefined,
    payment_gateway_names: undefined,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status || undefined,
    tags: order.tags ? order.tags.split(',') : [],
    note: order.note || undefined,
    cancelled_at: order.cancelled_at || undefined,
    cancel_reason: order.cancel_reason || undefined,
    shopify_created_at: order.created_at,
    shopify_updated_at: order.updated_at,
    processed_at: order.processed_at || undefined,
  }));

  try {
    await batchInsertOrders(ordersToInsert);
  } catch (error: any) {
    errors.push(`Orders batch insert failed: ${error.message}`);
  }

  // Extract and insert returns (refunds)
  const returnsToInsert: any[] = [];

  for (const order of orders) {
    if (order.refunds && order.refunds.length > 0) {
      for (const refund of order.refunds) {
        const refundTotal = refund.refund_line_items.reduce(
          (sum, item) => sum + item.subtotal + item.total_tax,
          0
        );

        returnsToInsert.push({
          merchant_id: merchantId,
          shopify_return_id: refund.id.toString(),
          return_reason: refund.note || null,
          return_value: refundTotal,
          currency: order.currency,
          items_returned: refund.refund_line_items,
          source: 'shopify_refund',
          return_status: 'completed',
          restock: refund.restock,
          shopify_created_at: refund.created_at,
          processed_at: refund.created_at,
        });

        returnsCreated++;
      }
    }
  }

  if (returnsToInsert.length > 0) {
    try {
      await batchInsertReturns(returnsToInsert);
    } catch (error: any) {
      errors.push(`Returns batch insert failed: ${error.message}`);
    }
  }

  // Update customer stats (would need to aggregate from DB)
  // This is simplified - in production, you'd query aggregated stats
  // For now, we'll rely on the webhook handlers to update stats incrementally

  return {
    orders_processed: orders.length,
    customers_created: customersCreated,
    returns_created: returnsCreated,
    errors,
  };
}

/**
 * Sync single order (for webhook processing)
 *
 * @param merchantId - Merchant ID
 * @param order - Shopify order
 */
export async function syncOrder(
  merchantId: string,
  order: ShopifyOrder
): Promise<void> {
  // Upsert customer
  if (order.customer && order.customer.id) {
    try {
      const customer = await upsertCustomer({
        merchant_id: merchantId,
        shopify_customer_id: order.customer.id.toString(),
        email: order.customer.email,
        first_name: order.customer.first_name,
        last_name: order.customer.last_name,
        phone: order.customer.phone,
        default_address: order.customer.default_address || undefined,
        accepts_marketing: order.customer.accepts_marketing,
        tags: order.customer.tags ? order.customer.tags.split(',') : [],
        status: order.customer.state as any,
        shopify_created_at: order.customer.created_at,
        shopify_updated_at: order.customer.updated_at,
      });

      // Update customer stats (increment orders)
      await updateCustomerStats(customer.id, {
        total_orders: customer.total_orders + 1,
        total_spent: customer.total_spent + parseFloat(order.total_price),
      });
    } catch (error: any) {
      console.error('Error upserting customer:', error);
    }
  }

  // Upsert order
  try {
    await batchInsertOrders([
      {
        merchant_id: merchantId,
        shopify_order_id: order.id.toString(),
        order_number: order.order_number.toString(),
        email: order.email,
        total_price: parseFloat(order.total_price),
        subtotal_price: order.subtotal_price ? parseFloat(order.subtotal_price) : undefined,
        total_tax: order.total_tax ? parseFloat(order.total_tax) : undefined,
        total_discounts: order.total_discounts
          ? parseFloat(order.total_discounts)
          : undefined,
        currency: order.currency,
        line_items: order.line_items,
        shipping_address: order.shipping_address || undefined,
        billing_address: order.billing_address || undefined,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status || undefined,
        tags: order.tags ? order.tags.split(',') : [],
        note: order.note || undefined,
        cancelled_at: order.cancelled_at || undefined,
        cancel_reason: order.cancel_reason || undefined,
        shopify_created_at: order.created_at,
        shopify_updated_at: order.updated_at,
        processed_at: order.processed_at || undefined,
      },
    ]);
  } catch (error: any) {
    console.error('Error upserting order:', error);
    throw error;
  }
}

/**
 * Sync single refund (for webhook processing)
 *
 * @param merchantId - Merchant ID
 * @param refund - Shopify refund
 * @param orderId - Associated order ID
 */
export async function syncRefund(
  merchantId: string,
  refund: ShopifyRefund,
  orderId?: string
): Promise<string | null> {
  const refundTotal = refund.refund_line_items.reduce(
    (sum, item) => sum + item.subtotal + item.total_tax,
    0
  );

  try {
    // Insert return and get the ID
    const supabase = getSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('returns')
      .upsert(
        {
          merchant_id: merchantId,
          order_id: orderId || undefined,
          shopify_return_id: refund.id.toString(),
          return_reason: refund.note || undefined,
          return_value: refundTotal,
          currency: 'USD', // Would get from order
          items_returned: refund.refund_line_items,
          source: 'shopify_refund',
          return_status: 'completed',
          restock: refund.restock,
          shopify_created_at: refund.created_at,
          processed_at: refund.created_at,
        },
        {
          onConflict: 'merchant_id,shopify_return_id',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single();

    if (error) {
      console.error('Error upserting refund:', error);
      throw error;
    }

    // TODO: Update customer stats (increment returns, recalculate return_rate)

    return data?.id || null;
  } catch (error: any) {
    console.error('Error upserting refund:', error);
    throw error;
  }
}
