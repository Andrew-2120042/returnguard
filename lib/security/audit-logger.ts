/**
 * Security Audit Logger
 * Phase 3: Tracks all sensitive operations for security auditing
 */

import { getSupabaseClient } from '@/lib/supabase-client';

export type AuditEventType =
  | 'MERCHANT_LOGIN'
  | 'MERCHANT_OAUTH'
  | 'DATA_SHARING_ENABLED'
  | 'DATA_SHARING_DISABLED'
  | 'POLICY_UPDATED'
  | 'CUSTOMER_DATA_ACCESSED'
  | 'FRAUD_INTELLIGENCE_QUERIED'
  | 'WEBHOOK_RECEIVED'
  | 'API_KEY_REGENERATED'
  | 'SCOPE_VALIDATION_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SUSPICIOUS_ACTIVITY_DETECTED'
  | 'FRAUD_ANALYSIS_RUN'
  | 'RETURN_PROCESSED';

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AuditEventParams {
  merchantId?: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  actorIp?: string;
  actorUserAgent?: string;
  endpoint?: string;
  requestMethod?: string;
  requestBody?: any;
  responseStatus?: number;
  details?: Record<string, any>;
}

export interface SecurityIncidentParams {
  type: string;
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
  merchantId?: string;
  shopDomain?: string;
  description: string;
  details?: Record<string, any>;
}

/**
 * Log a security audit event
 * IMPORTANT: Never let audit logging break the app
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Sanitize request body - remove sensitive fields
    let sanitizedBody = params.requestBody;
    if (sanitizedBody) {
      sanitizedBody = sanitizeData(sanitizedBody);
    }

    const { error } = await (supabase as any).from('security_audit_logs').insert({
      merchant_id: params.merchantId || null,
      event_type: params.eventType,
      severity: params.severity,
      actor_ip: params.actorIp || null,
      actor_user_agent: params.actorUserAgent || null,
      endpoint: params.endpoint || null,
      request_method: params.requestMethod || null,
      request_body: sanitizedBody || null,
      response_status: params.responseStatus || null,
      details: params.details || {},
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - audit logging should never break the app
    }

    // If CRITICAL severity, also create a security incident
    if (params.severity === 'CRITICAL') {
      await logSecurityIncident({
        type: params.eventType,
        severity: 'CRITICAL',
        merchantId: params.merchantId,
        description: `Critical event: ${params.eventType}`,
        details: params.details
      });
    }
  } catch (error) {
    console.error('Error in logAuditEvent:', error);
    // Never throw - audit logging failures should not break the app
  }
}

/**
 * Log a security incident
 * Creates a record for admin investigation
 */
export async function logSecurityIncident(
  params: SecurityIncidentParams
): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('security_incidents')
      .insert({
        incident_type: params.type,
        severity: params.severity,
        merchant_id: params.merchantId || null,
        shop_domain: params.shopDomain || null,
        description: params.description,
        detected_at: new Date().toISOString(),
        metadata: params.details || {},
        notified_admin: false,
        auto_resolved: false
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log security incident:', error);
      return null;
    }

    // If CRITICAL, send alert to admin
    if (params.severity === 'CRITICAL') {
      await sendCriticalSecurityAlert({
        incidentId: data.id,
        type: params.type,
        merchantId: params.merchantId,
        shopDomain: params.shopDomain,
        description: params.description
      });
    }

    return data.id;
  } catch (error) {
    console.error('Error in logSecurityIncident:', error);
    return null;
  }
}

/**
 * Get recent audit logs for a merchant
 */
export async function getRecentAuditLogs(
  merchantId: string,
  hours: number = 24
): Promise<any[]> {
  try {
    const supabase = getSupabaseClient();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('security_audit_logs')
      .select('*')
      .eq('merchant_id', merchantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getRecentAuditLogs:', error);
    return [];
  }
}

/**
 * Get unresolved security incidents
 */
export async function getUnresolvedIncidents(
  merchantId?: string
): Promise<any[]> {
  try {
    const supabase = getSupabaseClient();

    let query = supabase
      .from('security_incidents')
      .select('*')
      .is('resolved_at', null)
      .order('severity', { ascending: false })
      .order('detected_at', { ascending: false });

    if (merchantId) {
      query = query.eq('merchant_id', merchantId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch incidents:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUnresolvedIncidents:', error);
    return [];
  }
}

/**
 * Resolve a security incident
 */
export async function resolveSecurityIncident(
  incidentId: string,
  resolutionNotes: string,
  autoResolved: boolean = false
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await (supabase as any)
      .from('security_incidents')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes,
        auto_resolved: autoResolved
      })
      .eq('id', incidentId);

    if (error) {
      console.error('Failed to resolve incident:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in resolveSecurityIncident:', error);
    return false;
  }
}

/**
 * Send critical security alert to admin
 * TODO: Integrate with email/Slack notification system
 */
async function sendCriticalSecurityAlert(params: {
  incidentId: string;
  type: string;
  merchantId?: string;
  shopDomain?: string;
  description: string;
}): Promise<void> {
  try {
    // Log to console for now
    console.error('🚨 CRITICAL SECURITY ALERT', {
      incidentId: params.incidentId,
      type: params.type,
      merchantId: params.merchantId,
      shopDomain: params.shopDomain,
      description: params.description,
      timestamp: new Date().toISOString()
    });

    // TODO: Implement email notification
    // await sendEmail({
    //   to: process.env.ADMIN_EMAIL,
    //   subject: `🚨 CRITICAL SECURITY ALERT: ${params.type}`,
    //   body: params.description
    // });

    // TODO: Implement Slack notification
    // await sendSlackAlert({
    //   channel: '#security-alerts',
    //   message: `🚨 CRITICAL: ${params.type} - ${params.description}`
    // });
  } catch (error) {
    console.error('Failed to send critical security alert:', error);
  }
}

/**
 * Sanitize data to remove sensitive information
 * Used before logging request bodies
 */
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const SENSITIVE_KEYS = [
    'access_token',
    'api_key',
    'api_secret',
    'password',
    'encryption_key',
    'shopify_api_key',
    'shopify_api_secret',
    'session_secret',
    'salt_secret_key',
    'credit_card',
    'cvv',
    'ssn'
  ];

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key in sanitized) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}
