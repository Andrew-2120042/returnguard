/**
 * Webhook manager with version tracking
 * Automatically re-registers webhooks when API version changes (ISSUE #6)
 */

import {
  getMerchantById,
  updateMerchant,
} from './supabase-client';
import { createShopifyClient } from './shopify-client';
import { getEnvVar } from './utils';

/**
 * Webhook topics to register
 */
const WEBHOOK_TOPICS = [
  {
    topic: 'orders/create',
    path: '/api/sync/webhook/orders',
  },
  {
    topic: 'refunds/create',
    path: '/api/sync/webhook/refunds',
  },
  {
    topic: 'customers/data_request',
    path: '/api/webhooks/gdpr/customers-data-request',
  },
  {
    topic: 'customers/redact',
    path: '/api/webhooks/gdpr/customers-redact',
  },
  {
    topic: 'shop/redact',
    path: '/api/webhooks/gdpr/shop-redact',
  },
] as const;

/**
 * Register all webhooks for a merchant
 *
 * @param merchantId - Merchant ID
 */
export async function registerWebhooksForMerchant(
  merchantId: string
): Promise<void> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  // Create Shopify client
  const client = await createShopifyClient(
    merchant.shop_domain,
    merchant.access_token_encrypted,
    merchant.access_token_iv,
    merchant.access_token_auth_tag,
    merchant.id
  );

  // Get current API version
  const currentApiVersion = getEnvVar('SHOPIFY_API_VERSION');
  const appUrl = getEnvVar('SHOPIFY_APP_URL');

  // Delete existing webhooks (to avoid duplicates)
  try {
    const existingWebhooks = await client.getWebhooks();
    for (const webhook of existingWebhooks) {
      // Only delete webhooks created by this app
      if (webhook.address.startsWith(appUrl)) {
        await client.deleteWebhook(webhook.id.toString());
      }
    }
  } catch (error) {
    console.error('Error deleting existing webhooks:', error);
  }

  // Register new webhooks
  for (const { topic, path } of WEBHOOK_TOPICS) {
    try {
      await client.createWebhook({
        topic,
        address: `${appUrl}${path}`,
        format: 'json',
      });
      console.log(`Registered webhook: ${topic}`);
    } catch (error) {
      console.error(`Failed to register webhook ${topic}:`, error);
      throw error;
    }
  }

  // Update merchant with webhook version
  await updateMerchant(merchantId, {
    webhooks_registered: true,
    webhook_api_version: currentApiVersion,
  });
}

/**
 * Check if webhooks need re-registration
 * Call this on app startup or first API request
 *
 * @param merchantId - Merchant ID
 * @returns True if webhooks were re-registered
 */
export async function checkAndReregisterWebhooks(
  merchantId: string
): Promise<boolean> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    return false;
  }

  const currentApiVersion = getEnvVar('SHOPIFY_API_VERSION');

  // Check if API version has changed
  if (merchant.webhook_api_version !== currentApiVersion) {
    console.log(
      `API version changed from ${merchant.webhook_api_version} to ${currentApiVersion}, re-registering webhooks...`
    );

    await reregisterWebhooks(merchantId);
    return true;
  }

  return false;
}

/**
 * Re-register webhooks with current API version
 *
 * @param merchantId - Merchant ID
 */
export async function reregisterWebhooks(merchantId: string): Promise<void> {
  // Same as registerWebhooksForMerchant, but explicitly for version changes
  await registerWebhooksForMerchant(merchantId);
}

/**
 * Verify webhook topics are registered
 *
 * @param merchantId - Merchant ID
 * @returns Array of missing topics
 */
export async function verifyWebhooks(merchantId: string): Promise<string[]> {
  const merchant = await getMerchantById(merchantId);

  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }

  const client = await createShopifyClient(
    merchant.shop_domain,
    merchant.access_token_encrypted,
    merchant.access_token_iv,
    merchant.access_token_auth_tag,
    merchant.id
  );

  const existingWebhooks = await client.getWebhooks();
  const existingTopics = existingWebhooks.map((w) => w.topic);

  const missingTopics = WEBHOOK_TOPICS.filter(
    (w) => !existingTopics.includes(w.topic)
  ).map((w) => w.topic);

  return missingTopics;
}
