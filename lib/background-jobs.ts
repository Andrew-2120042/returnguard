/**
 * Background jobs system for async tasks
 * Prevents OAuth callback timeout (ISSUE #1)
 *
 * Job types:
 * - register-webhooks: Register Shopify webhooks after OAuth
 * - initial-sync: Pull historical data after OAuth
 * - reregister-webhooks: Re-register webhooks on API version change
 * - fraud-analysis: Analyze return for fraud (Phase 2)
 */

import {
  createBackgroundJob,
  getBackgroundJobById,
  getPendingJobs,
  updateBackgroundJob,
} from './supabase-client';
import type { BackgroundJob } from './types';

/**
 * Queue a background job
 *
 * @param merchantId - Merchant ID
 * @param jobType - Type of job
 * @param payload - Job payload (optional)
 * @returns Created job
 */
export async function queueJob(
  merchantId: string,
  jobType: 'register-webhooks' | 'initial-sync' | 'reregister-webhooks' | 'fraud-analysis',
  payload?: any
): Promise<BackgroundJob> {
  return await createBackgroundJob({
    merchant_id: merchantId,
    job_type: jobType,
    payload,
    status: 'pending',
    retry_count: 0,
    max_retries: 3,
  });
}

/**
 * Get job status
 *
 * @param jobId - Job ID
 * @returns Job or null
 */
export async function getJobStatus(jobId: string): Promise<BackgroundJob | null> {
  return await getBackgroundJobById(jobId);
}

/**
 * Mark job as processing
 *
 * @param jobId - Job ID
 */
export async function markJobProcessing(jobId: string): Promise<void> {
  await updateBackgroundJob(jobId, {
    status: 'processing',
    started_at: new Date().toISOString(),
  });
}

/**
 * Mark job as completed
 *
 * @param jobId - Job ID
 */
export async function markJobCompleted(jobId: string): Promise<void> {
  await updateBackgroundJob(jobId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}

/**
 * Mark job as failed
 *
 * @param jobId - Job ID
 * @param error - Error message
 * @param shouldRetry - Whether to retry
 */
export async function markJobFailed(
  jobId: string,
  error: string,
  shouldRetry: boolean = true
): Promise<void> {
  const job = await getBackgroundJobById(jobId);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const newRetryCount = job.retry_count + 1;
  const shouldRetryAgain = shouldRetry && newRetryCount < job.max_retries;

  const updates: Partial<BackgroundJob> = {
    error_message: error,
    retry_count: newRetryCount,
  };

  if (shouldRetryAgain) {
    // Schedule retry with exponential backoff
    const delay = Math.pow(2, newRetryCount) * 1000; // 2s, 4s, 8s
    updates.next_retry_at = new Date(Date.now() + delay).toISOString();
  } else {
    // Max retries reached
    updates.status = 'failed';
    updates.completed_at = new Date().toISOString();
  }

  await updateBackgroundJob(jobId, updates);
}

/**
 * Process pending jobs
 * Call this from a cron job or API route
 *
 * @param limit - Max number of jobs to process
 */
export async function processPendingJobs(limit: number = 10): Promise<void> {
  const jobs = await getPendingJobs(limit);

  for (const job of jobs) {
    try {
      await markJobProcessing(job.id);

      // Process job based on type
      if (job.job_type === 'register-webhooks') {
        await processRegisterWebhooksJob(job);
      } else if (job.job_type === 'initial-sync') {
        await processInitialSyncJob(job);
      } else if (job.job_type === 'reregister-webhooks') {
        await processReregisterWebhooksJob(job);
      } else if (job.job_type === 'fraud-analysis') {
        await processFraudAnalysisJob(job);
      }

      await markJobCompleted(job.id);
    } catch (error: any) {
      console.error(`Job ${job.id} failed:`, error);
      await markJobFailed(job.id, error.message);
    }
  }
}

/**
 * Process register-webhooks job
 * Registers webhooks for a merchant
 */
async function processRegisterWebhooksJob(job: BackgroundJob): Promise<void> {
  const { registerWebhooksForMerchant } = await import('./webhook-manager');
  await registerWebhooksForMerchant(job.merchant_id);
}

/**
 * Process initial-sync job
 * Syncs historical data for a merchant
 */
async function processInitialSyncJob(job: BackgroundJob): Promise<void> {
  const { runInitialSync } = await import('./sync-engine');
  await runInitialSync(job.merchant_id);
}

/**
 * Process reregister-webhooks job
 * Re-registers webhooks with new API version
 */
async function processReregisterWebhooksJob(job: BackgroundJob): Promise<void> {
  const { reregisterWebhooks } = await import('./webhook-manager');
  await reregisterWebhooks(job.merchant_id);
}

/**
 * Process fraud-analysis job
 * Analyzes a return for fraud
 */
async function processFraudAnalysisJob(job: BackgroundJob): Promise<void> {
  const { analyzeFraudForReturn } = await import('./fraud-engine');

  const { return_id, customer_id, order_id, merchant_id } = job.payload;

  if (!return_id || !customer_id || !order_id || !merchant_id) {
    throw new Error('Missing required fraud analysis parameters');
  }

  await analyzeFraudForReturn(return_id, customer_id, order_id, merchant_id);
}
