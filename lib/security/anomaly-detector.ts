/**
 * Anomaly Detector
 * Phase 3: Detects unusual patterns that may indicate security threats
 *
 * Runs periodically via cron to identify suspicious merchant behavior
 */

import { getSupabaseClient } from '@/lib/supabase-client';
import { getRecentAuditLogs, logSecurityIncident } from './audit-logger';

export interface Anomaly {
  type: string;
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  details: Record<string, any>;
}

export interface AnomalyDetectionResult {
  merchantId: string;
  shopDomain: string;
  anomalies: Anomaly[];
  totalAnomalies: number;
  highestSeverity: 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
}

/**
 * Detect anomalies for a single merchant
 *
 * @param merchantId - Merchant ID to analyze
 * @returns Anomaly detection result
 */
export async function detectAnomalies(
  merchantId: string
): Promise<AnomalyDetectionResult> {
  const anomalies: Anomaly[] = [];
  const supabase = getSupabaseClient();

  // Get merchant details
  const { data: merchant } = await supabase
    .from('merchants')
    .select('shop_domain')
    .eq('id', merchantId)
    .single();

  if (!merchant) {
    return {
      merchantId,
      shopDomain: 'unknown',
      anomalies: [],
      totalAnomalies: 0,
      highestSeverity: null
    };
  }

  const merch = merchant as any;

  // Get recent audit logs (last 24 hours)
  const recentLogs = await getRecentAuditLogs(merchantId, 24);

  // ANOMALY 1: Unusual access volume (5x normal)
  await checkUnusualAccessVolume(merchantId, recentLogs, anomalies);

  // ANOMALY 2: Multiple failed authentication attempts
  await checkFailedAuthAttempts(merchantId, recentLogs, anomalies);

  // ANOMALY 3: Access from new IP addresses
  await checkNewIPAddresses(merchantId, recentLogs, anomalies);

  // ANOMALY 4: Rapid policy changes
  await checkRapidPolicyChanges(merchantId, recentLogs, anomalies);

  // ANOMALY 5: Data sharing toggled multiple times
  await checkDataSharingToggles(merchantId, recentLogs, anomalies);

  // Determine highest severity
  let highestSeverity: 'MEDIUM' | 'HIGH' | 'CRITICAL' | null = null;
  for (const anomaly of anomalies) {
    if (anomaly.severity === 'CRITICAL') {
      highestSeverity = 'CRITICAL';
      break;
    } else if (anomaly.severity === 'HIGH' && (!highestSeverity || highestSeverity === 'MEDIUM')) {
      highestSeverity = 'HIGH';
    } else if (anomaly.severity === 'MEDIUM' && !highestSeverity) {
      highestSeverity = 'MEDIUM';
    }
  }

  // Log security incidents for each anomaly
  for (const anomaly of anomalies) {
    await logSecurityIncident({
      type: anomaly.type,
      severity: anomaly.severity,
      merchantId,
      shopDomain: merch.shop_domain,
      description: anomaly.description,
      details: anomaly.details
    });
  }

  return {
    merchantId,
    shopDomain: merch.shop_domain,
    anomalies,
    totalAnomalies: anomalies.length,
    highestSeverity
  };
}

/**
 * Check for unusual access volume
 */
async function checkUnusualAccessVolume(
  merchantId: string,
  recentLogs: any[],
  anomalies: Anomaly[]
): Promise<void> {
  const supabase = getSupabaseClient();

  // Get average daily log count over last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data: historicalLogs } = await supabase
    .from('security_audit_logs')
    .select('created_at')
    .eq('merchant_id', merchantId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (!historicalLogs || historicalLogs.length === 0) {
    return; // Not enough data
  }

  const averageDailyLogs = historicalLogs.length / 30;
  const todayLogs = recentLogs.length;

  // If today's logs are 5x the average, flag as anomaly
  if (todayLogs > averageDailyLogs * 5 && todayLogs > 100) {
    anomalies.push({
      type: 'UNUSUAL_ACCESS_VOLUME',
      severity: 'MEDIUM',
      description: `Unusual access volume detected: ${todayLogs} requests in 24h (avg: ${averageDailyLogs.toFixed(0)})`,
      details: {
        today_logs: todayLogs,
        average_logs: averageDailyLogs,
        multiplier: (todayLogs / averageDailyLogs).toFixed(2)
      }
    });
  }
}

/**
 * Check for multiple failed authentication attempts
 */
async function checkFailedAuthAttempts(
  merchantId: string,
  recentLogs: any[],
  anomalies: Anomaly[]
): Promise<void> {
  const failedAuthLogs = recentLogs.filter(
    (log) => log.event_type === 'MERCHANT_LOGIN' && log.response_status === 401
  );

  if (failedAuthLogs.length > 5) {
    anomalies.push({
      type: 'MULTIPLE_FAILED_AUTH',
      severity: 'HIGH',
      description: `Multiple failed authentication attempts: ${failedAuthLogs.length} in 24h`,
      details: {
        failed_attempts: failedAuthLogs.length,
        unique_ips: Array.from(new Set(failedAuthLogs.map((log) => log.actor_ip))).length
      }
    });
  }
}

/**
 * Check for access from new IP addresses
 */
async function checkNewIPAddresses(
  merchantId: string,
  recentLogs: any[],
  anomalies: Anomaly[]
): Promise<void> {
  const supabase = getSupabaseClient();

  // Get historical IP addresses (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const { data: historicalLogs } = await supabase
    .from('security_audit_logs')
    .select('actor_ip')
    .eq('merchant_id', merchantId)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .not('actor_ip', 'is', null);

  const historicalIPs = new Set(historicalLogs?.map((log: any) => log.actor_ip) || []);
  const recentIPs = new Set(
    recentLogs.map((log: any) => log.actor_ip).filter((ip: any) => ip !== null)
  );

  const newIPs = Array.from(recentIPs).filter((ip) => !historicalIPs.has(ip));

  if (newIPs.length > 5) {
    anomalies.push({
      type: 'MULTIPLE_NEW_IPS',
      severity: 'MEDIUM',
      description: `Access from ${newIPs.length} new IP addresses in 24h`,
      details: {
        new_ip_count: newIPs.length,
        new_ips: newIPs
      }
    });
  }
}

/**
 * Check for rapid policy changes
 */
async function checkRapidPolicyChanges(
  merchantId: string,
  recentLogs: any[],
  anomalies: Anomaly[]
): Promise<void> {
  const policyChangeLogs = recentLogs.filter(
    (log) => log.event_type === 'POLICY_UPDATED'
  );

  if (policyChangeLogs.length > 10) {
    anomalies.push({
      type: 'RAPID_POLICY_CHANGES',
      severity: 'MEDIUM',
      description: `Rapid policy changes: ${policyChangeLogs.length} updates in 24h`,
      details: {
        policy_changes: policyChangeLogs.length
      }
    });
  }
}

/**
 * Check for data sharing toggled multiple times
 */
async function checkDataSharingToggles(
  merchantId: string,
  recentLogs: any[],
  anomalies: Anomaly[]
): Promise<void> {
  const dataSharingLogs = recentLogs.filter(
    (log) =>
      log.event_type === 'DATA_SHARING_ENABLED' ||
      log.event_type === 'DATA_SHARING_DISABLED'
  );

  if (dataSharingLogs.length > 3) {
    anomalies.push({
      type: 'DATA_SHARING_TOGGLED',
      severity: 'MEDIUM',
      description: `Data sharing toggled ${dataSharingLogs.length} times in 24h`,
      details: {
        toggle_count: dataSharingLogs.length
      }
    });
  }
}

/**
 * Run anomaly detection for all active merchants
 * Called by cron job
 */
export async function runAnomalyDetectionForAllMerchants(): Promise<{
  total: number;
  withAnomalies: number;
  totalAnomalies: number;
}> {
  const supabase = getSupabaseClient();

  // Get all active merchants
  const { data: merchants } = await supabase
    .from('merchants')
    .select('id')
    .eq('is_active', true);

  if (!merchants) {
    return { total: 0, withAnomalies: 0, totalAnomalies: 0 };
  }

  let merchantsWithAnomalies = 0;
  let totalAnomaliesCount = 0;

  for (const merchant of (merchants as any[])) {
    const result = await detectAnomalies(merchant.id);

    if (result.totalAnomalies > 0) {
      merchantsWithAnomalies++;
      totalAnomaliesCount += result.totalAnomalies;

      console.log(
        `Detected ${result.totalAnomalies} anomalies for merchant ${result.shopDomain}`
      );
    }
  }

  console.log(
    `Anomaly detection complete: ${merchantsWithAnomalies}/${merchants.length} merchants with anomalies (${totalAnomaliesCount} total)`
  );

  return {
    total: merchants.length,
    withAnomalies: merchantsWithAnomalies,
    totalAnomalies: totalAnomaliesCount
  };
}
