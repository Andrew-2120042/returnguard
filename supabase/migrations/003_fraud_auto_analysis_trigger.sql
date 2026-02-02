/**
 * Fraud Auto-Analysis Trigger
 * Phase 2: Automatically queue fraud analysis for new returns
 *
 * This trigger creates a background job for fraud analysis whenever
 * a new return is inserted with customer_id and order_id.
 *
 * Note: This handles returns created during initial sync or manual creation.
 * Webhook-created returns are handled directly in the webhook code.
 */

-- Create function to queue fraud analysis background job
CREATE OR REPLACE FUNCTION queue_fraud_analysis_for_return()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue analysis if return has required data and hasn't been analyzed yet
  IF NEW.customer_id IS NOT NULL
     AND NEW.order_id IS NOT NULL
     AND NEW.fraud_confidence IS NULL
  THEN
    -- Insert background job for fraud analysis
    INSERT INTO background_jobs (
      merchant_id,
      job_type,
      payload,
      status,
      retry_count,
      max_retries
    ) VALUES (
      NEW.merchant_id,
      'fraud-analysis',
      jsonb_build_object(
        'return_id', NEW.id,
        'customer_id', NEW.customer_id,
        'order_id', NEW.order_id,
        'merchant_id', NEW.merchant_id
      ),
      'pending',
      0,
      3
    );

    -- Log the queued analysis
    RAISE NOTICE 'Queued fraud analysis for return %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on returns table
DROP TRIGGER IF EXISTS trigger_queue_fraud_analysis ON returns;

CREATE TRIGGER trigger_queue_fraud_analysis
  AFTER INSERT ON returns
  FOR EACH ROW
  EXECUTE FUNCTION queue_fraud_analysis_for_return();

-- Add comment
COMMENT ON FUNCTION queue_fraud_analysis_for_return() IS
  'Automatically queues fraud analysis background job when a return is created';

COMMENT ON TRIGGER trigger_queue_fraud_analysis ON returns IS
  'Triggers fraud analysis for newly created returns with customer_id and order_id';
