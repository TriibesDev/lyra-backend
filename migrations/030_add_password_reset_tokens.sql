-- Migration: Add password reset tokens table
-- Purpose: Store secure password reset tokens for the forgot password flow

-- Create the password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for looking up tokens by user (for cleanup and rate limiting)
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Index for finding expired tokens (for cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Comment on the table
COMMENT ON TABLE password_reset_tokens IS 'Stores password reset tokens for the forgot password flow';
COMMENT ON COLUMN password_reset_tokens.token IS 'Secure random 64-character hex token';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expiration time (1 hour after creation)';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'Timestamp when token was used to reset password (NULL if unused)';
