/**
 * Security Audit Logs and Incident Tracking
 * Phase 3: Enterprise-grade security logging
 *
 * Tracks all sensitive operations and security incidents
 */

-- Security Audit Logs Table
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  actor_ip TEXT,
  actor_user_agent TEXT,
  endpoint TEXT,
  request_method TEXT,
  request_body JSONB,
  response_status INTEGER,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_audit_logs_merchant ON security_audit_logs(merchant_id, created_at DESC);
CREATE INDEX idx_audit_logs_severity ON security_audit_logs(severity, created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON security_audit_logs(event_type, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON security_audit_logs(created_at DESC);

-- Security Incidents Table
CREATE TABLE IF NOT EXISTS security_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('MEDIUM', 'HIGH', 'CRITICAL')),
  merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
  shop_domain TEXT,
  description TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  auto_resolved BOOLEAN DEFAULT false,
  notified_admin BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for incident tracking
CREATE INDEX idx_incidents_unresolved ON security_incidents(severity, detected_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX idx_incidents_merchant ON security_incidents(merchant_id, detected_at DESC);
CREATE INDEX idx_incidents_type ON security_incidents(incident_type, detected_at DESC);

-- Add comments
COMMENT ON TABLE security_audit_logs IS 'Tracks all sensitive operations for security auditing';
COMMENT ON TABLE security_incidents IS 'Tracks security incidents requiring investigation or action';

COMMENT ON COLUMN security_audit_logs.event_type IS 'Type of event: MERCHANT_LOGIN, DATA_SHARING_ENABLED, etc.';
COMMENT ON COLUMN security_audit_logs.severity IS 'Severity level: LOW, MEDIUM, HIGH, CRITICAL';
COMMENT ON COLUMN security_incidents.incident_type IS 'Type of incident: FORBIDDEN_SCOPE_DETECTED, RATE_LIMIT_EXCEEDED, etc.';
