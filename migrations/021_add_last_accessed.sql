-- Migration 021: Add last_accessed column to projects
-- Tracks when a project was last opened/accessed for sorting

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for sorting by last accessed
CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed DESC);

-- Initialize last_accessed with last_modified_at for existing projects
UPDATE projects SET last_accessed = last_modified_at WHERE last_accessed IS NULL;
