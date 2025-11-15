-- Migration: Add project_sessions and shadow_backups tables
-- Purpose: Enable concurrent editing detection and automatic cloud backups for local projects

-- Create project_sessions table for tracking active editing sessions
CREATE TABLE IF NOT EXISTS project_sessions (
    session_id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_heartbeat TIMESTAMP DEFAULT NOW(),

    -- Index for finding active sessions by project
    CONSTRAINT idx_project_sessions_project UNIQUE (project_id, session_id)
);

-- Index for cleanup queries (find stale sessions)
CREATE INDEX idx_project_sessions_heartbeat ON project_sessions(last_heartbeat);

-- Index for finding sessions by user
CREATE INDEX idx_project_sessions_user ON project_sessions(user_id);

-- Create shadow_backups table for cloud copies of local projects
CREATE TABLE IF NOT EXISTS shadow_backups (
    local_project_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    project_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for finding backups by user
CREATE INDEX idx_shadow_backups_user ON shadow_backups(user_id);

-- Index for finding recently updated backups
CREATE INDEX idx_shadow_backups_updated ON shadow_backups(updated_at);

-- Add comments for documentation
COMMENT ON TABLE project_sessions IS 'Tracks active editing sessions for concurrent editing detection';
COMMENT ON TABLE shadow_backups IS 'Cloud backup copies of local .scribe files for disaster recovery';

COMMENT ON COLUMN project_sessions.last_heartbeat IS 'Updated every 30 seconds by active sessions';
COMMENT ON COLUMN shadow_backups.local_project_id IS 'ID of the local project (format: local_UUID)';
