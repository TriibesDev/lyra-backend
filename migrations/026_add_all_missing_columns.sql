-- Migration 026: Add all remaining missing columns to match backend expectations

-- Add missing user columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_to_last_project BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_project_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_view VARCHAR(50);

-- Add missing project columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chapter_count INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scene_count INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS character_count INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_project_id UUID;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_last_project ON users(last_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at);
CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id);

-- Add comments
COMMENT ON COLUMN users.city IS 'User city';
COMMENT ON COLUMN users.state IS 'User state/province';
COMMENT ON COLUMN users.country IS 'User country';
COMMENT ON COLUMN users.login_to_last_project IS 'Auto-login to last accessed project';
COMMENT ON COLUMN users.last_project_id IS 'Last accessed project ID';
COMMENT ON COLUMN users.last_view IS 'Last active view (writer, timeline, card, etc)';

COMMENT ON COLUMN projects.last_accessed IS 'Last time project was accessed';
COMMENT ON COLUMN projects.word_count IS 'Total word count in project';
COMMENT ON COLUMN projects.chapter_count IS 'Number of chapters';
COMMENT ON COLUMN projects.scene_count IS 'Number of scenes';
COMMENT ON COLUMN projects.character_count IS 'Number of characters';
COMMENT ON COLUMN projects.archived_at IS 'When project was archived (NULL if not archived)';
COMMENT ON COLUMN projects.is_draft IS 'Whether project is in draft mode';
COMMENT ON COLUMN projects.parent_project_id IS 'Parent project if this is a draft/version';
COMMENT ON COLUMN projects.deleted_at IS 'Soft delete timestamp (NULL if not deleted)';

SELECT 'Migration 026 completed - all missing columns added' AS status;
