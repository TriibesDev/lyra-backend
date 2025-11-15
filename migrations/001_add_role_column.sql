-- Migration: Add role column to users table
-- Description: Adds role-based access control to support admin functionality

-- Add role column with default value 'user'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
    END IF;
END $$;

-- Create index for efficient role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Add check constraint to ensure only valid roles (drop first if exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_valid_role') THEN
        ALTER TABLE users ADD CONSTRAINT check_valid_role
          CHECK (role IN ('user', 'admin', 'superadmin'));
    END IF;
END $$;

-- Optional: Set a specific user as admin (replace email with your email)
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
