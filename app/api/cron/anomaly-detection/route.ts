/**
 * Anomaly Detection Cron Endpoint
 * Phase 3: Runs hourly to detect suspicious merchant behavior
 *
 * Called by Vercel Cron: /api/cron/anomaly-detection
 */

import { NextResponse } from 'next/server';
import { runAnomalyDetectionForAllMerchants } from '@/lib/security/anomaly-detector';

export async function GET(request: Request) {
  try {
    // Verify cron authentication
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

    if (authHeader !== expectedAuth) {
      console.error('Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting anomaly detection for all merchants...');

    // Run anomaly detection
    const result = await runAnomalyDetectionForAllMerchants();

    console.log('Anomaly detection complete:', result);

    return NextResponse.json({
      success: true,
      result: {
        total_merchants: result.total,
        merchants_with_anomalies: result.withAnomalies,
        total_anomalies: result.totalAnomalies
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error in anomaly detection cron:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}
