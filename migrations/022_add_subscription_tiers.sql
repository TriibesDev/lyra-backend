-- Migration 022: Add subscription tier support
-- This migration adds support for multiple subscription tiers and plan types

-- Add constraint for subscription_tier to define valid tier values
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_subscription_tier;
ALTER TABLE users ADD CONSTRAINT valid_subscription_tier
  CHECK (subscription_tier IS NULL OR subscription_tier IN (
    'trial',
    'monthly',
    'annual',
    'lifetime',
    'special',
    'educator',
    'student'
  ));

-- Add column for special access end date (for time-limited plans)
ALTER TABLE users ADD COLUMN IF NOT EXISTS special_access_end_date TIMESTAMP WITH TIME ZONE;

-- Add column to track the Stripe price ID used (helps with plan management)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);

-- Add index on subscription_tier for faster queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);

-- Add index on special_access_end_date for expiration checks
CREATE INDEX IF NOT EXISTS idx_users_special_access_end_date ON users(special_access_end_date);

-- Add comments for documentation
COMMENT ON COLUMN users.subscription_tier IS 'Type of subscription plan: trial, monthly, annual, lifetime, special, educator, student';
COMMENT ON COLUMN users.special_access_end_date IS 'End date for time-limited plans (special, educator, student). NULL means no expiration.';
COMMENT ON COLUMN users.stripe_price_id IS 'Stripe Price ID associated with current subscription';

SELECT 'Migration 022 completed' AS status;
