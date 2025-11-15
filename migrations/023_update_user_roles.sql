-- Migration 023: Update user roles
-- Add new role types: writer, reader, guest

-- Drop old role constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;

-- Add new role constraint with all role types
ALTER TABLE users ADD CONSTRAINT valid_role
  CHECK (role IN (
    'superadmin',
    'admin',
    'writer',
    'reader',
    'guest',
    'user'  -- Keep for backward compatibility
  ));

-- Add next_billing_date column for subscription management
ALTER TABLE users ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE;

-- Add index on next_billing_date for billing queries
CREATE INDEX IF NOT EXISTS idx_users_next_billing_date ON users(next_billing_date);

-- Add comment
COMMENT ON COLUMN users.next_billing_date IS 'Next billing date for subscription renewal';

SELECT 'Migration 023 completed' AS status;
