-- Add feedback columns to fraud_alerts table
-- This allows merchants to provide feedback on fraud detection accuracy

ALTER TABLE fraud_alerts
ADD COLUMN IF NOT EXISTS merchant_feedback TEXT CHECK (merchant_feedback IN ('accurate', 'false_positive', 'not_sure')),
ADD COLUMN IF NOT EXISTS merchant_feedback_reason TEXT,
ADD COLUMN IF NOT EXISTS merchant_feedback_at TIMESTAMPTZ;

-- Create index for feedback analytics
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_feedback
ON fraud_alerts(merchant_feedback)
WHERE merchant_feedback IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN fraud_alerts.merchant_feedback IS 'Merchant feedback on alert accuracy: accurate, false_positive, or not_sure';
COMMENT ON COLUMN fraud_alerts.merchant_feedback_reason IS 'Optional reason or notes from merchant about their feedback';
COMMENT ON COLUMN fraud_alerts.merchant_feedback_at IS 'Timestamp when merchant provided feedback';

-- Success message
SELECT 'Feedback columns added to fraud_alerts table' as status;
