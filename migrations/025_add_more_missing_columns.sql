-- Migration 025: Add more missing columns

-- Add first_name and last_name to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

-- Add archived column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- Add index on archived for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);

-- Add comments
COMMENT ON COLUMN users.first_name IS 'User first name';
COMMENT ON COLUMN users.last_name IS 'User last name';
COMMENT ON COLUMN projects.archived IS 'Whether the project is archived';

SELECT 'Migration 025 completed' AS status;
