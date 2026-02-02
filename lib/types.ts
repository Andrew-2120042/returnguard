// ReturnGuard TypeScript Type Definitions

// ============================================================================
// DATABASE ENTITIES
// ============================================================================

export interface Merchant {
  id: string;
  shop_domain: string;
  shopify_shop_id: string;

  // Encrypted access token
  access_token_encrypted: string;
  access_token_iv: string;
  access_token_auth_tag: string;
  encryption_key_version: number;

  // Shop metadata
  shop_name?: string;
  shop_email?: string;
  shop_owner?: string;
  shop_currency: string;
  shop_timezone?: string;

  // Billing
  plan: 'free' | 'professional' | 'business' | 'enterprise';
  returns_quota: number;
  returns_used_this_month: number;
  billing_cycle_start: string;
  shopify_charge_id?: string;

  // Sync progress
  sync_status: 'idle' | 'syncing' | 'error';
  sync_progress: number;
  sync_total_orders: number;
  orders_synced_count: number;
  last_sync_at?: string;

  // Resume sync
  last_synced_order_id?: string;

  // Webhook tracking
  webhook_api_version: string;
  webhooks_registered: boolean;

  // Data sharing (Phase 2/3)
  data_sharing_enabled: boolean;
  data_sharing_consent_at?: string;

  // Status
  is_active: boolean;
  uninstalled_at?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  merchant_id: string;
  shopify_customer_id: string;

  // Customer info
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;

  // Address
  default_address?: ShopifyAddress;

  // Stats
  total_orders: number;
  total_spent: number;
  total_returns: number;
  return_rate: number;

  // Risk scoring
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';

  // Hashed identifiers (Phase 2/3 - for cross-merchant fraud detection)
  email_hash?: string;
  phone_hash?: string;
  billing_address_hash?: string;

  // Metadata
  accepts_marketing: boolean;
  marketing_opt_in_level?: string;
  tags?: string[];
  note?: string;

  // Status
  status: 'enabled' | 'disabled' | 'invited' | 'declined';

  // Timestamps
  shopify_created_at?: string;
  shopify_updated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  merchant_id: string;
  customer_id?: string;
  shopify_order_id: string;

  // Order details
  order_number: string;
  email?: string;
  total_price: number;
  subtotal_price?: number;
  total_tax?: number;
  total_discounts?: number;
  currency: string;

  // Line items
  line_items: ShopifyLineItem[];

  // Addresses
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  shipping_lines?: any[];

  // Payment
  payment_gateway_names?: string[];
  financial_status?: string;

  // Fulfillment
  fulfillment_status?: string;
  fulfilled_at?: string;

  // Metadata
  tags?: string[];
  note?: string;
  source_name?: string;

  // Cancellation
  cancelled_at?: string;
  cancel_reason?: string;

  // Timestamps
  shopify_created_at: string;
  shopify_updated_at?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Return {
  id: string;
  merchant_id: string;
  customer_id?: string;
  order_id?: string;
  shopify_return_id: string;

  // Return metadata
  return_reason?: string;
  return_value: number;
  currency: string;

  // Returned items
  items_returned: ShopifyRefundLineItem[];

  // Data source
  source: 'shopify_refund' | 'loop_returns' | 'aftership_returns' | 'manual';

  // Status
  return_status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

  // Fraud detection (Phase 2)
  is_fraudulent: boolean;
  fraud_confidence?: number;
  fraud_reasons?: string[];
  risk_score?: number; // 0-100 calculated by fraud engine
  fraud_signals?: any[]; // Array of FraudSignalResult
  action_taken?: 'approved' | 'flagged' | 'blocked' | 'pending';
  action_reason?: string;

  // Metadata
  restock: boolean;
  note?: string;

  // Timestamps
  shopify_created_at?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FraudSignal {
  id: string;
  merchant_id: string;
  customer_id?: string;
  return_id: string;

  signal_type:
    | 'high_frequency'
    | 'value_discrepancy'
    | 'item_mismatch'
    | 'address_mismatch'
    | 'velocity_spike'
    | 'duplicate_claim'
    | 'behavioral_anomaly';
  signal_weight: number;
  signal_data?: any;

  detected_at: string;
  created_at: string;
}

export interface BackgroundJob {
  id: string;
  merchant_id: string;

  job_type: 'register-webhooks' | 'initial-sync' | 'reregister-webhooks' | 'fraud-analysis';
  payload?: any;

  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  retry_count: number;
  max_retries: number;

  created_at: string;
  started_at?: string;
  completed_at?: string;
  next_retry_at?: string;
}

export interface BillingPlan {
  plan_name: 'free' | 'professional' | 'business' | 'enterprise';
  display_name: string;
  price_monthly: number;
  returns_quota: number;
  features: {
    fraud_detection: boolean;
    advanced_analytics: boolean;
    custom_integrations?: boolean;
  };
}

// ============================================================================
// SHOPIFY API TYPES
// ============================================================================

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopify_domain: string;
  shop_owner: string;
  currency: string;
  timezone: string;
  iana_timezone: string;
  plan_name: string;
  plan_display_name: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  created_at: string;
  updated_at: string;
  processed_at: string;
  customer?: ShopifyCustomer;
  line_items: ShopifyLineItem[];
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status?: string;
  tags: string;
  note?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  refunds?: ShopifyRefund[];
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  orders_count: number;
  total_spent: string;
  default_address?: ShopifyAddress;
  addresses?: ShopifyAddress[];
  accepts_marketing: boolean;
  marketing_opt_in_level?: string;
  tags: string;
  note?: string;
  state: string;
}

export interface ShopifyLineItem {
  id: number;
  variant_id?: number;
  product_id?: number;
  title: string;
  variant_title?: string;
  sku?: string;
  quantity: number;
  price: string;
  total_discount: string;
  fulfillment_status?: string;
}

export interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  note?: string;
  restock: boolean;
  refund_line_items: ShopifyRefundLineItem[];
  transactions: ShopifyRefundTransaction[];
}

export interface ShopifyRefundLineItem {
  id: number;
  line_item_id: number;
  quantity: number;
  restock_type: string;
  location_id?: number;
  line_item: ShopifyLineItem;
  subtotal: number;
  total_tax: number;
}

export interface ShopifyRefundTransaction {
  id: number;
  order_id: number;
  amount: string;
  kind: string;
  gateway: string;
  status: string;
  created_at: string;
}

export interface ShopifyAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  country?: string;
  country_code?: string;
  zip?: string;
  phone?: string;
  name?: string;
  company?: string;
}

export interface ShopifyWebhook {
  id: number;
  address: string;
  topic: string;
  format: 'json' | 'xml';
  created_at: string;
  updated_at: string;
  api_version: string;
}

// Shopify Recurring Charge (Billing)
export interface ShopifyRecurringCharge {
  id: number;
  name: string;
  price: string;
  status: 'pending' | 'active' | 'declined' | 'cancelled' | 'expired' | 'frozen';
  return_url: string;
  test: boolean;
  created_at: string;
  updated_at: string;
  activated_on?: string;
  cancelled_on?: string;
  trial_days: number;
  trial_ends_on?: string;
  confirmation_url?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface OAuthCallbackParams {
  shop: string;
  code: string;
  hmac: string;
  timestamp: string;
  state?: string;
  host?: string;
}

export interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

export interface WebhookPayload {
  shop_domain: string;
  [key: string]: any;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export interface SessionData {
  shop_domain: string;
  merchant_id: string;
}

// ============================================================================
// DASHBOARD API TYPES
// ============================================================================

export interface DashboardStats {
  total_customers: number;
  total_orders: number;
  total_returns: number;
  overall_return_rate: number;
  total_revenue: number;
  total_refunded: number;
  quota_used: number;
  quota_limit: number;
  plan: string;
}

export interface CustomerListItem {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  total_orders: number;
  total_spent: number;
  total_returns: number;
  return_rate: number;
  risk_score: number;
  risk_level: string;
}

export interface CustomerDetail extends Customer {
  orders: Order[];
  returns: Return[];
}

export interface TimelineEvent {
  type: 'order' | 'return';
  event_id: string;
  reference: string;
  amount: number;
  currency: string;
  event_date: string;
  details: any;
  order_id?: string;
  return_id?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// ============================================================================
// SYNC ENGINE TYPES
// ============================================================================

export interface SyncProgress {
  sync_status: 'idle' | 'syncing' | 'error';
  sync_progress: number;
  orders_synced_count: number;
  sync_total_orders: number;
  last_sync_at?: string;
}

export interface SyncResult {
  success: boolean;
  orders_processed: number;
  customers_created: number;
  returns_created: number;
  errors: string[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class ReturnGuardError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'ReturnGuardError';
  }
}

export class ShopifyAPIError extends ReturnGuardError {
  constructor(message: string) {
    super(message, 'SHOPIFY_API_ERROR', 502);
    this.name = 'ShopifyAPIError';
  }
}

export class DatabaseError extends ReturnGuardError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

export class AuthenticationError extends ReturnGuardError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class QuotaExceededError extends ReturnGuardError {
  constructor(message: string) {
    super(message, 'QUOTA_EXCEEDED', 403);
    this.name = 'QuotaExceededError';
  }
}

// ============================================================================
// FRAUD DETECTION TYPES (PHASE 2)
// ============================================================================

export interface FraudSignalResult {
  signal_id: number;
  signal_name: string;
  score: number;
  max_score: number;
  triggered: boolean;
  details: string;
  metadata?: any;
}

export interface RiskAnalysis {
  return_id: string;
  customer_id: string;
  merchant_id: string;
  risk_score: number; // 0-100
  risk_level: 'low' | 'medium' | 'high';
  signals: FraudSignalResult[];
  action_taken: 'approved' | 'flagged' | 'blocked' | 'pending';
  action_reason: string;
  analyzed_at: string;
}

export interface FraudIntelligence {
  id: string;
  entity_type: 'email' | 'ip_address' | 'phone' | 'device' | 'billing_address';
  entity_hash: string;
  fraud_score: number;
  total_appearances: number;
  total_orders: number;
  total_returns: number;
  total_chargebacks: number;
  return_rate: number;
  chargeback_rate: number;
  merchant_count: number;
  first_seen_at: string;
  last_seen_at: string;
  is_confirmed_fraud: boolean;
  fraud_patterns: any;
  created_at: string;
  updated_at: string;
}

export interface MerchantPolicy {
  id: string;
  merchant_id: string;
  policy_type: 'auto_approve' | 'flag_review' | 'auto_block';
  min_risk_score: number;
  max_risk_score: number;
  actions: {
    approve_return?: boolean;
    process_refund?: boolean;
    require_review?: boolean;
    send_alert?: boolean;
    block_return?: boolean;
    require_override?: boolean;
    [key: string]: any;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FraudAlert {
  id: string;
  merchant_id: string;
  return_id?: string;
  customer_id?: string;
  alert_type:
    | 'high_risk_return'
    | 'serial_returner'
    | 'cross_store_fraud'
    | 'quota_exceeded'
    | 'policy_violation'
    | 'velocity_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metadata: any;
  is_read: boolean;
  is_acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by?: string;
  created_at: string;
}

export interface FraudAnalytics {
  total_returns_analyzed: number;
  fraud_prevented_value: number;
  high_risk_customers: number;
  average_risk_score: number;
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
  };
  top_signals: Array<{
    signal_name: string;
    trigger_count: number;
    avg_score: number;
  }>;
  savings_trend: Array<{
    date: string;
    amount: number;
  }>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}
