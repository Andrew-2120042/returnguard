import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTrigger() {
  console.log('🔧 Fixing fraud analysis trigger...');

  const sql = `
    -- Drop the old trigger and function
    DROP TRIGGER IF EXISTS trigger_queue_fraud_analysis ON returns;
    DROP FUNCTION IF EXISTS queue_fraud_analysis_for_return();

    -- Recreate function with correct column name (fraud_confidence instead of risk_score)
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
    CREATE TRIGGER trigger_queue_fraud_analysis
      AFTER INSERT ON returns
      FOR EACH ROW
      EXECUTE FUNCTION queue_fraud_analysis_for_return();
  `;

  try {
    // Execute SQL directly
    const result = await supabase.rpc('exec', { query: sql }).catch(() => {
      // If rpc doesn't exist, try direct query execution
      return supabase.from('_').select('*').limit(0);
    });
    const error = result.error;

    // Since Supabase doesn't have direct SQL execution via client,
    // we'll log instructions for manual execution
    console.log('\n⚠️  Note: Trigger fix SQL needs to be run in Supabase SQL Editor');
    console.log('\n📋 Copy this SQL to Supabase SQL Editor:\n');
    console.log(sql);
    console.log('\n✅ Trigger fix SQL prepared (run in Supabase SQL Editor)');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTrigger();
