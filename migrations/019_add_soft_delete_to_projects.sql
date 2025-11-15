-- Migration 019: Add soft delete support to projects table
-- This allows projects to be moved to trash and recovered within 30-60 days

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Create an index on deleted_at for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

-- Create an index on user_id and deleted_at for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_projects_user_deleted ON projects(user_id, deleted_at);
