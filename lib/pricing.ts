/**
 * ReturnGuard Pricing Configuration
 * Beta launch pricing with special early adopter rates
 */

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  maxCustomers?: number;
  returnsQuota: number;
  isBeta?: boolean;
  stripePriceId?: string; // For Stripe integration
  shopifyPlanId?: string; // For Shopify billing
}

export const PRICING_PLANS: Record<string, PricingPlan> = {
  beta: {
    id: 'beta',
    name: 'Beta',
    price: 99,
    description: 'Exclusive beta pricing - 50% off forever',
    features: [
      'Fraud risk scoring (11 behavioral signals)',
      'Category-aware thresholds',
      'Real-time fraud alerts',
      'Dashboard analytics',
      'Customer risk profiles',
      'Return timeline analysis',
      'Email support',
      'Beta feedback program',
      'Locked-in beta pricing forever'
    ],
    maxCustomers: 10, // First 10 merchants only
    returnsQuota: 500, // 500 returns per month
    isBeta: true
  },

  standard: {
    id: 'standard',
    name: 'Standard',
    price: 199,
    description: 'Full fraud detection suite',
    features: [
      'Everything in Beta',
      'Unlimited returns analysis',
      'Priority email support',
      'Custom threshold tuning',
      'API access',
      'Webhook customization',
      'Advanced analytics',
      'Export reports'
    ],
    returnsQuota: 999999 // Unlimited
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    price: 399,
    description: 'For high-volume merchants',
    features: [
      'Everything in Standard',
      'Cross-store intelligence (coming Q2 2026)',
      'Dedicated account manager',
      'Phone support',
      'Custom integrations',
      'SLA guarantee',
      'Custom fraud rules',
      'Quarterly business reviews'
    ],
    returnsQuota: 999999 // Unlimited
  }
};

// Helper function to get plan by ID
export function getPlan(planId: string): PricingPlan | undefined {
  return PRICING_PLANS[planId];
}

// Helper function to check if beta slots are available
export async function checkBetaAvailability(): Promise<boolean> {
  // TODO: Query database to count merchants on beta plan
  // For now, return true to allow beta signups
  return true;
}

// Calculate effective price with beta discount
export function getEffectivePrice(planId: string): number {
  const plan = getPlan(planId);
  if (!plan) return 0;

  // Beta plan is already discounted
  if (plan.isBeta) {
    return plan.price;
  }

  // Apply any active promotions here
  return plan.price;
}

// Get human-readable features list
export function getPlanFeatures(planId: string): string[] {
  const plan = getPlan(planId);
  return plan?.features || [];
}

// Pricing display helpers
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function getPricingDisplay(planId: string): string {
  const plan = getPlan(planId);
  if (!plan) return '';

  return `${formatPrice(plan.price)}/month`;
}
