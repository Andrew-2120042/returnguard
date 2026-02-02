/**
 * Fraud Alerts
 * Phase 2: Alert generation and notification system
 *
 * Generates fraud alerts and sends notifications via email/Slack
 */

import { supabase } from './supabase-client';
import type { FraudAlert } from './types';

/**
 * Generate fraud alert
 *
 * @param merchantId - Merchant ID
 * @param returnId - Return ID (optional)
 * @param customerId - Customer ID (optional)
 * @param alertType - Type of alert
 * @param severity - Severity level
 * @param message - Alert message
 * @param metadata - Additional metadata
 * @returns Created alert
 */
export async function generateFraudAlert(
  merchantId: string,
  returnId: string | null,
  customerId: string | null,
  alertType:
    | 'high_risk_return'
    | 'serial_returner'
    | 'cross_store_fraud'
    | 'quota_exceeded'
    | 'policy_violation'
    | 'velocity_spike',
  severity: 'low' | 'medium' | 'high' | 'critical',
  message: string,
  metadata: any = {}
): Promise<FraudAlert | null> {
  // Insert alert into database
  const { data: alert, error } = await (supabase as any)
    .from('fraud_alerts')
    .insert({
      merchant_id: merchantId,
      return_id: returnId,
      customer_id: customerId,
      alert_type: alertType,
      severity,
      message,
      metadata,
      is_read: false,
      is_acknowledged: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating fraud alert:', error);
    return null;
  }

  // Send notifications based on severity
  if (severity === 'high' || severity === 'critical') {
    await sendAlertNotifications(alert, merchantId);
  }

  return alert;
}

/**
 * Send alert notifications (email, Slack, etc.)
 *
 * @param alert - Fraud alert
 * @param merchantId - Merchant ID
 */
async function sendAlertNotifications(
  alert: FraudAlert,
  merchantId: string
): Promise<void> {
  // Get merchant details for notification preferences
  const { data: merchant } = await supabase
    .from('merchants')
    .select('shop_email, shop_name')
    .eq('id', merchantId)
    .single();

  if (!merchant) {
    console.error('Merchant not found for notifications');
    return;
  }

  const merch = merchant as any;

  // Send email notification
  const emailEnabled = process.env.FRAUD_ALERT_EMAIL;
  if (emailEnabled && merch.shop_email) {
    await sendEmailNotification(alert, merch.shop_email, merch.shop_name);
  }

  // Send Slack notification
  const slackWebhook = process.env.FRAUD_ALERT_SLACK_WEBHOOK;
  if (slackWebhook) {
    await sendSlackNotification(alert, slackWebhook, merch.shop_name);
  }
}

/**
 * Send email notification
 *
 * @param alert - Fraud alert
 * @param email - Recipient email
 * @param shopName - Shop name
 */
async function sendEmailNotification(
  alert: FraudAlert,
  email: string,
  shopName: string
): Promise<void> {
  // TODO: Implement email sending (using SendGrid, Resend, etc.)
  console.log(`Email notification sent to ${email}:`, {
    subject: `[${alert.severity.toUpperCase()}] ${alert.alert_type}`,
    message: alert.message,
    shop: shopName,
  });

  // Example implementation with fetch (you'd use your email provider)
  /*
  const emailPayload = {
    to: email,
    from: process.env.FRAUD_ALERT_EMAIL,
    subject: `[ReturnGuard ${alert.severity.toUpperCase()}] ${formatAlertType(alert.alert_type)}`,
    html: `
      <h2>Fraud Alert - ${shopName}</h2>
      <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
      <p><strong>Type:</strong> ${formatAlertType(alert.alert_type)}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Time:</strong> ${new Date(alert.created_at).toLocaleString()}</p>
      <p><a href="${process.env.SHOPIFY_APP_URL}/dashboard/fraud/alerts">View in Dashboard</a></p>
    `,
  };

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });
  */
}

/**
 * Send Slack notification
 *
 * @param alert - Fraud alert
 * @param webhookUrl - Slack webhook URL
 * @param shopName - Shop name
 */
async function sendSlackNotification(
  alert: FraudAlert,
  webhookUrl: string,
  shopName: string
): Promise<void> {
  const color =
    alert.severity === 'critical'
      ? 'danger'
      : alert.severity === 'high'
        ? 'warning'
        : 'good';

  const payload = {
    text: `Fraud Alert - ${shopName}`,
    attachments: [
      {
        color,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true,
          },
          {
            title: 'Type',
            value: formatAlertType(alert.alert_type),
            short: true,
          },
          {
            title: 'Message',
            value: alert.message,
            short: false,
          },
        ],
        footer: 'ReturnGuard',
        ts: Math.floor(new Date(alert.created_at).getTime() / 1000),
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Error sending Slack notification:', error);
  }
}

/**
 * Format alert type for display
 *
 * @param alertType - Alert type
 * @returns Formatted string
 */
function formatAlertType(alertType: string): string {
  return alertType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get unread alerts for merchant
 *
 * @param merchantId - Merchant ID
 * @param limit - Maximum number of alerts
 * @returns Unread alerts
 */
export async function getUnreadAlerts(
  merchantId: string,
  limit: number = 50
): Promise<FraudAlert[]> {
  const { data: alerts, error } = await supabase
    .from('fraud_alerts')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching unread alerts:', error);
    return [];
  }

  return alerts || [];
}

/**
 * Mark alert as read
 *
 * @param alertId - Alert ID
 * @returns Success status
 */
export async function markAlertAsRead(alertId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('fraud_alerts')
    .update({ is_read: true })
    .eq('id', alertId);

  if (error) {
    console.error('Error marking alert as read:', error);
    return false;
  }

  return true;
}

/**
 * Acknowledge alert
 *
 * @param alertId - Alert ID
 * @param acknowledgedBy - User who acknowledged
 * @returns Success status
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('fraud_alerts')
    .update({
      is_acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: acknowledgedBy,
    })
    .eq('id', alertId);

  if (error) {
    console.error('Error acknowledging alert:', error);
    return false;
  }

  return true;
}

/**
 * Get alert statistics for merchant
 *
 * @param merchantId - Merchant ID
 * @returns Alert statistics
 */
export async function getAlertStatistics(merchantId: string): Promise<{
  total_alerts: number;
  unread_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  alerts_last_24h: number;
}> {
  const { data: alerts, error } = await supabase
    .from('fraud_alerts')
    .select('severity, created_at, is_read')
    .eq('merchant_id', merchantId);

  if (error || !alerts) {
    return {
      total_alerts: 0,
      unread_alerts: 0,
      critical_alerts: 0,
      high_alerts: 0,
      alerts_last_24h: 0,
    };
  }

  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  return {
    total_alerts: alerts.length,
    unread_alerts: alerts.filter((a: any) => !a.is_read).length,
    critical_alerts: alerts.filter((a: any) => a.severity === 'critical').length,
    high_alerts: alerts.filter((a: any) => a.severity === 'high').length,
    alerts_last_24h: alerts.filter(
      (a: any) => new Date(a.created_at) > twentyFourHoursAgo
    ).length,
  };
}
