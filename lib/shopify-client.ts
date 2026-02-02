/**
 * Shopify API client with Upstash Redis rate limiting
 * Uses sliding window algorithm: 40 calls per 20 seconds (Shopify's actual limit)
 *
 * ISSUE #8 FIX: Distributed rate limiting with Upstash Redis
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getEnvVar, buildShopifyAPIUrl, retry } from './utils';
import { decryptAccessToken } from './crypto';
import type {
  ShopifyShop,
  ShopifyOrder,
  ShopifyCustomer,
  ShopifyWebhook,
  ShopifyRecurringCharge,
  AccessTokenResponse,
  ShopifyAPIError,
} from './types';

// Initialize Upstash Redis rate limiter
// Shopify's actual limit: 40 calls per 20 seconds (leaky bucket, not 2/sec token bucket)
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(40, '20s'),
  analytics: true,
  prefix: 'ratelimit:shopify',
});

/**
 * Shopify API client with automatic rate limiting
 */
export class ShopifyClient {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string;
  private axios: AxiosInstance;

  constructor(shopDomain: string, accessToken: string, apiVersion?: string) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion || getEnvVar('SHOPIFY_API_VERSION');

    // Create axios instance with default config
    this.axios = axios.create({
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Make rate-limited API request
   * Automatically handles rate limiting and retries
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    // Check rate limit
    const { success, reset } = await ratelimit.limit(this.shopDomain);

    if (!success) {
      // Wait until rate limit resets
      const waitTime = reset - Date.now();
      console.log(`Rate limit hit, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.request<T>(method, endpoint, data, config);
    }

    // Build URL
    const url = buildShopifyAPIUrl(this.shopDomain, endpoint, this.apiVersion);

    try {
      const response = await this.axios.request<T>({
        method,
        url,
        data,
        ...config,
      });

      return response.data;
    } catch (error: any) {
      // Handle Shopify API errors
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.errors || error.message;

        // If 429 (rate limit), retry after delay
        if (status === 429) {
          console.log('Shopify returned 429, retrying...');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return this.request<T>(method, endpoint, data, config);
        }

        throw new Error(`Shopify API Error (${status}): ${JSON.stringify(message)}`);
      }

      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: any): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, { params });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>('POST', endpoint, data);
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>('PUT', endpoint, data);
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint);
  }

  // ==========================================================================
  // SHOP API
  // ==========================================================================

  /**
   * Get shop information
   */
  async getShop(): Promise<ShopifyShop> {
    const response = await this.get<{ shop: ShopifyShop }>('shop.json');
    return response.shop;
  }

  // ==========================================================================
  // ORDERS API
  // ==========================================================================

  /**
   * Get orders with pagination
   * @param params - Query parameters (limit, since_id, created_at_min, etc.)
   */
  async getOrders(params?: {
    limit?: number;
    since_id?: string;
    created_at_min?: string;
    created_at_max?: string;
    status?: string;
  }): Promise<ShopifyOrder[]> {
    const response = await this.get<{ orders: ShopifyOrder[] }>('orders.json', params);
    return response.orders;
  }

  /**
   * Get single order by ID
   */
  async getOrder(orderId: string): Promise<ShopifyOrder> {
    const response = await this.get<{ order: ShopifyOrder }>(`orders/${orderId}.json`);
    return response.order;
  }

  /**
   * Count total orders
   */
  async getOrdersCount(params?: {
    created_at_min?: string;
    created_at_max?: string;
  }): Promise<number> {
    const response = await this.get<{ count: number }>('orders/count.json', params);
    return response.count;
  }

  // ==========================================================================
  // CUSTOMERS API
  // ==========================================================================

  /**
   * Get customers with pagination
   */
  async getCustomers(params?: {
    limit?: number;
    since_id?: string;
  }): Promise<ShopifyCustomer[]> {
    const response = await this.get<{ customers: ShopifyCustomer[] }>(
      'customers.json',
      params
    );
    return response.customers;
  }

  /**
   * Get single customer by ID
   */
  async getCustomer(customerId: string): Promise<ShopifyCustomer> {
    const response = await this.get<{ customer: ShopifyCustomer }>(
      `customers/${customerId}.json`
    );
    return response.customer;
  }

  // ==========================================================================
  // WEBHOOKS API
  // ==========================================================================

  /**
   * Create webhook
   */
  async createWebhook(webhook: {
    topic: string;
    address: string;
    format?: 'json' | 'xml';
  }): Promise<ShopifyWebhook> {
    const response = await this.post<{ webhook: ShopifyWebhook }>('webhooks.json', {
      webhook: {
        ...webhook,
        format: webhook.format || 'json',
      },
    });
    return response.webhook;
  }

  /**
   * Get all webhooks
   */
  async getWebhooks(): Promise<ShopifyWebhook[]> {
    const response = await this.get<{ webhooks: ShopifyWebhook[] }>('webhooks.json');
    return response.webhooks;
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.delete(`webhooks/${webhookId}.json`);
  }

  /**
   * Delete all webhooks (for cleanup)
   */
  async deleteAllWebhooks(): Promise<void> {
    const webhooks = await this.getWebhooks();
    for (const webhook of webhooks) {
      await this.deleteWebhook(webhook.id.toString());
    }
  }

  // ==========================================================================
  // BILLING API (GraphQL)
  // ==========================================================================

  /**
   * Execute GraphQL query
   */
  private async graphql<T>(query: string, variables?: any): Promise<T> {
    const url = `https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`;

    const { success, reset } = await ratelimit.limit(this.shopDomain);

    if (!success) {
      const waitTime = reset - Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.graphql<T>(query, variables);
    }

    try {
      const response = await this.axios.post(url, { query, variables });

      if (response.data.errors) {
        throw new Error(
          `GraphQL Error: ${JSON.stringify(response.data.errors)}`
        );
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(`GraphQL request failed: ${error.message}`);
    }
  }

  /**
   * Create recurring application charge (subscription)
   */
  async createRecurringCharge(params: {
    name: string;
    price: number;
    returnUrl: string;
    test?: boolean;
  }): Promise<{ confirmationUrl: string; chargeId: string }> {
    const mutation = `
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          test: $test
        ) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      name: params.name,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: params.price, currencyCode: 'USD' },
            },
          },
        },
      ],
      returnUrl: params.returnUrl,
      test: params.test || false,
    };

    const result = await this.graphql<{
      appSubscriptionCreate: {
        appSubscription: { id: string };
        confirmationUrl: string;
        userErrors: any[];
      };
    }>(mutation, variables);

    if (result.appSubscriptionCreate.userErrors.length > 0) {
      throw new Error(
        `Failed to create subscription: ${JSON.stringify(
          result.appSubscriptionCreate.userErrors
        )}`
      );
    }

    return {
      confirmationUrl: result.appSubscriptionCreate.confirmationUrl,
      chargeId: result.appSubscriptionCreate.appSubscription.id,
    };
  }

  /**
   * Get recurring charge status
   */
  async getRecurringCharge(chargeId: string): Promise<{
    id: string;
    status: string;
    name: string;
    price: string;
  }> {
    const query = `
      query getSubscription($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            name
            status
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.graphql<{
      node: {
        id: string;
        name: string;
        status: string;
        lineItems: any[];
      };
    }>(query, { id: chargeId });

    return {
      id: result.node.id,
      status: result.node.status,
      name: result.node.name,
      price: result.node.lineItems[0]?.plan?.pricingDetails?.price?.amount || '0',
    };
  }

  /**
   * Cancel recurring charge
   */
  async cancelRecurringCharge(chargeId: string): Promise<void> {
    const mutation = `
      mutation appSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          appSubscription {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await this.graphql<{
      appSubscriptionCancel: {
        appSubscription: { id: string; status: string };
        userErrors: any[];
      };
    }>(mutation, { id: chargeId });

    if (result.appSubscriptionCancel.userErrors.length > 0) {
      throw new Error(
        `Failed to cancel subscription: ${JSON.stringify(
          result.appSubscriptionCancel.userErrors
        )}`
      );
    }
  }
}

// ============================================================================
// OAUTH UTILITIES
// ============================================================================

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(shop: string, state?: string): string {
  const apiKey = getEnvVar('SHOPIFY_API_KEY');
  const scopes = getEnvVar('SHOPIFY_SCOPES');
  const redirectUri = `${getEnvVar('SHOPIFY_APP_URL')}/api/auth/shopify/callback`;

  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state || '',
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<string> {
  const apiKey = getEnvVar('SHOPIFY_API_KEY');
  const apiSecret = getEnvVar('SHOPIFY_API_SECRET');
  const url = `https://${shop}/admin/oauth/access_token`;

  try {
    const response = await axios.post<AccessTokenResponse>(url, {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    });

    return response.data.access_token;
  } catch (error: any) {
    throw new Error(
      `Failed to exchange code for token: ${error.response?.data?.error || error.message}`
    );
  }
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

/**
 * Create Shopify client from encrypted merchant data
 */
export async function createShopifyClient(
  shopDomain: string,
  encryptedToken: string,
  iv: string,
  authTag: string,
  merchantId: string
): Promise<ShopifyClient> {
  const accessToken = decryptAccessToken(encryptedToken, iv, authTag, merchantId);
  return new ShopifyClient(shopDomain, accessToken);
}
