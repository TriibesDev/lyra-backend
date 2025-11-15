-- Migration: Add device and browser information to project_sessions
-- Purpose: Track which device/browser each session is using for better concurrent editing warnings

-- Add device/browser columns to project_sessions table
ALTER TABLE project_sessions
ADD COLUMN IF NOT EXISTS browser_name TEXT,
ADD COLUMN IF NOT EXISTS browser_version TEXT,
ADD COLUMN IF NOT EXISTS os_name TEXT,
ADD COLUMN IF NOT EXISTS device_type TEXT, -- 'mobile', 'tablet', or 'desktop'
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Add index for queries that filter by device type
CREATE INDEX IF NOT EXISTS idx_project_sessions_device_type ON project_sessions(device_type);

-- Add comments for documentation
COMMENT ON COLUMN project_sessions.browser_name IS 'Browser name (Chrome, Firefox, Safari, etc.)';
COMMENT ON COLUMN project_sessions.browser_version IS 'Browser version number';
COMMENT ON COLUMN project_sessions.os_name IS 'Operating system (Windows, macOS, Linux, etc.)';
COMMENT ON COLUMN project_sessions.device_type IS 'Device type: mobile, tablet, or desktop';
COMMENT ON COLUMN project_sessions.user_agent IS 'Full user agent string for debugging';
