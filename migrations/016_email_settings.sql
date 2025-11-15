-- Migration: Email Settings Configuration
-- Description: Stores SMTP configuration for sending system emails (beta reader invitations, etc.)
-- Created: 2025-10-19

-- Create email_settings table
CREATE TABLE IF NOT EXISTS email_settings (
  id SERIAL PRIMARY KEY,
  smtp_host VARCHAR(255) NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_pass TEXT NOT NULL, -- Encrypted/hashed in application layer
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(100) DEFAULT 'Emrys Scribe',
  use_tls BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comment
COMMENT ON TABLE email_settings IS 'SMTP email server configuration for sending system emails';

-- Only allow one row (singleton table)
CREATE UNIQUE INDEX email_settings_singleton ON email_settings ((id IS NOT NULL));

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
