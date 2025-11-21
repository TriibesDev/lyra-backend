-- Migration 021: Create email_settings table
-- This migration creates the email_settings table for SMTP configuration

CREATE TABLE IF NOT EXISTS email_settings (
  id SERIAL PRIMARY KEY,
  smtp_host VARCHAR(255),
  smtp_port INTEGER DEFAULT 587,
  smtp_user VARCHAR(255),
  smtp_pass TEXT,  -- Encrypted password
  from_email VARCHAR(255),
  from_name VARCHAR(255) DEFAULT 'CodexScribe',
  use_tls BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_settings_updated_at
  BEFORE UPDATE ON email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_email_settings_updated_at();

-- Insert default row (only one row should exist)
INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, from_name)
VALUES ('smtp.gmail.com', 587, '', 'CodexScribe')
ON CONFLICT DO NOTHING;

SELECT 'Migration 021 completed' AS status;
