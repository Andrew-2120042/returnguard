/**
 * Supabase client with CRUD operations for ReturnGuard
 * Uses service role key for server-side operations
 */

import { createClient } from '@supabase/supabase-js';
import { getEnvVar } from './utils';
import type {
  Merchant,
  Customer,
  Order,
  Return,
  FraudSignal,
  BackgroundJob,
  BillingPlan,
  DatabaseError,
} from './types';

// Lazy initialization of Supabase client
let supabaseInstance: ReturnType<typeof createClient> | null = null;

function initSupabase() {
  if (!supabaseInstance) {
    const supabaseUrl = getEnvVar('SUPABASE_URL');
    const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_KEY');

    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseInstance;
}

// Export for backwards compatibility
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(target, prop) {
    const client = initSupabase();
    return (client as any)[prop];
  }
});

// ============================================================================
// MERCHANTS
// ============================================================================

export async function createMerchant(data: Partial<Merchant>): Promise<Merchant> {
  const { data: merchant, error } = await (supabase as any)
    .from('merchants')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create merchant: ${error.message}`);
  }

  return merchant;
}

export async function getMerchantById(id: string): Promise<Merchant | null> {
  const { data, error } = await supabase
    .from('merchants')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found
    throw new Error(`Failed to get merchant: ${error.message}`);
  }

  return data;
}

export async function getMerchantByShopDomain(
  shopDomain: string
): Promise<Merchant | null> {
  const { data, error } = await supabase
    .from('merchants')
    .select('*')
    .eq('shop_domain', shopDomain)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get merchant: ${error.message}`);
  }

  return data;
}

export async function updateMerchant(
  id: string,
  updates: Partial<Merchant>
): Promise<Merchant> {
  const { data, error } = await (supabase as any)
    .from('merchants')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update merchant: ${error.message}`);
  }

  return data;
}

export async function incrementReturnsUsage(merchantId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('increment_returns_usage', {
    p_merchant_id: merchantId,
  });

  if (error) {
    throw new Error(`Failed to increment returns usage: ${error.message}`);
  }
}

export async function isOverQuota(merchantId: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('is_over_quota', {
    p_merchant_id: merchantId,
  });

  if (error) {
    throw new Error(`Failed to check quota: ${error.message}`);
  }

  return data;
}

export async function incrementSyncProgress(
  merchantId: string,
  ordersSynced: number
): Promise<void> {
  const { error } = await (supabase as any).rpc('increment_sync_progress', {
    p_merchant_id: merchantId,
    p_orders_synced: ordersSynced,
  });

  if (error) {
    throw new Error(`Failed to increment sync progress: ${error.message}`);
  }
}

// ============================================================================
// CUSTOMERS
// ============================================================================

export async function createCustomer(data: Partial<Customer>): Promise<Customer> {
  const { data: customer, error } = await (supabase as any)
    .from('customers')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create customer: ${error.message}`);
  }

  return customer;
}

export async function upsertCustomer(data: Partial<Customer>): Promise<Customer> {
  const { data: customer, error } = await (supabase as any)
    .from('customers')
    .upsert(data, {
      onConflict: 'merchant_id,shopify_customer_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert customer: ${error.message}`);
  }

  return customer;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get customer: ${error.message}`);
  }

  return data;
}

export async function getCustomersByMerchant(
  merchantId: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ data: Customer[]; count: number }> {
  const {
    page = 1,
    limit = 50,
    search = '',
    sortBy = 'return_rate',
    sortOrder = 'desc',
  } = options;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('merchant_id', merchantId);

  // Search filter
  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  // Sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get customers: ${error.message}`);
  }

  return { data: data || [], count: count || 0 };
}

export async function updateCustomerStats(
  customerId: string,
  stats: {
    total_orders?: number;
    total_spent?: number;
    total_returns?: number;
    return_rate?: number;
  }
): Promise<Customer> {
  const { data, error } = await (supabase as any)
    .from('customers')
    .update(stats)
    .eq('id', customerId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update customer stats: ${error.message}`);
  }

  return data;
}

// ============================================================================
// ORDERS
// ============================================================================

export async function createOrder(data: Partial<Order>): Promise<Order> {
  const { data: order, error } = await (supabase as any)
    .from('orders')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create order: ${error.message}`);
  }

  return order;
}

export async function upsertOrder(data: Partial<Order>): Promise<Order> {
  const { data: order, error } = await (supabase as any)
    .from('orders')
    .upsert(data, {
      onConflict: 'merchant_id,shopify_order_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert order: ${error.message}`);
  }

  return order;
}

export async function getOrdersByMerchant(
  merchantId: string,
  options: {
    page?: number;
    limit?: number;
    customerId?: string;
  } = {}
): Promise<{ data: Order[]; count: number }> {
  const { page = 1, limit = 50, customerId } = options;

  let query = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('merchant_id', merchantId);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  query = query.order('shopify_created_at', { ascending: false });

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get orders: ${error.message}`);
  }

  return { data: data || [], count: count || 0 };
}

export async function batchInsertOrders(orders: Partial<Order>[]): Promise<void> {
  if (orders.length === 0) return;

  const { error } = await (supabase as any).from('orders').upsert(orders, {
    onConflict: 'merchant_id,shopify_order_id',
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Failed to batch insert orders: ${error.message}`);
  }
}

// ============================================================================
// RETURNS
// ============================================================================

export async function createReturn(data: Partial<Return>): Promise<Return> {
  const { data: returnData, error } = await (supabase as any)
    .from('returns')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create return: ${error.message}`);
  }

  return returnData;
}

export async function upsertReturn(data: Partial<Return>): Promise<Return> {
  const { data: returnData, error } = await (supabase as any)
    .from('returns')
    .upsert(data, {
      onConflict: 'merchant_id,shopify_return_id,source',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert return: ${error.message}`);
  }

  return returnData;
}

export async function getReturnsByMerchant(
  merchantId: string,
  options: {
    page?: number;
    limit?: number;
    customerId?: string;
  } = {}
): Promise<{ data: Return[]; count: number }> {
  const { page = 1, limit = 50, customerId } = options;

  let query = supabase
    .from('returns')
    .select('*', { count: 'exact' })
    .eq('merchant_id', merchantId);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  query = query.order('shopify_created_at', { ascending: false });

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get returns: ${error.message}`);
  }

  return { data: data || [], count: count || 0 };
}

export async function batchInsertReturns(returns: Partial<Return>[]): Promise<void> {
  if (returns.length === 0) return;

  const { error } = await (supabase as any).from('returns').upsert(returns, {
    onConflict: 'merchant_id,shopify_return_id,source',
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Failed to batch insert returns: ${error.message}`);
  }
}

// ============================================================================
// CUSTOMER TIMELINE
// ============================================================================

export async function getCustomerTimeline(
  customerId: string,
  options: {
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: any[]; count: number }> {
  const { page = 1, limit = 50 } = options;

  // Use the customer_timeline view
  let query = supabase
    .from('customer_timeline')
    .select('*', { count: 'exact' })
    .eq('customer_id', customerId)
    .order('event_date', { ascending: false });

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get customer timeline: ${error.message}`);
  }

  return { data: data || [], count: count || 0 };
}

// ============================================================================
// BACKGROUND JOBS
// ============================================================================

export async function createBackgroundJob(
  data: Partial<BackgroundJob>
): Promise<BackgroundJob> {
  const { data: job, error } = await (supabase as any)
    .from('background_jobs')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create background job: ${error.message}`);
  }

  return job;
}

export async function getBackgroundJobById(id: string): Promise<BackgroundJob | null> {
  const { data, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get background job: ${error.message}`);
  }

  return data;
}

export async function getPendingJobs(limit: number = 10): Promise<BackgroundJob[]> {
  const { data, error } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get pending jobs: ${error.message}`);
  }

  return data || [];
}

export async function updateBackgroundJob(
  id: string,
  updates: Partial<BackgroundJob>
): Promise<BackgroundJob> {
  const { data, error } = await (supabase as any)
    .from('background_jobs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update background job: ${error.message}`);
  }

  return data;
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export async function getMerchantStats(merchantId: string): Promise<any> {
  const { data, error } = await supabase
    .from('merchant_stats')
    .select('*')
    .eq('merchant_id', merchantId)
    .single();

  if (error) {
    throw new Error(`Failed to get merchant stats: ${error.message}`);
  }

  return data;
}

// ============================================================================
// BILLING PLANS
// ============================================================================

export async function getBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .order('price_monthly', { ascending: true });

  if (error) {
    throw new Error(`Failed to get billing plans: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// PHASE 3: COMPATIBILITY HELPERS
// ============================================================================

/**
 * Helper function for Phase 3 modules
 * Returns the Supabase client instance (lazy initialization)
 *
 * Phase 3 security modules use getSupabaseClient() to get the client instance
 */
export function getSupabaseClient() {
  return initSupabase();
}
