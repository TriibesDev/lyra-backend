-- Migration 024: Add missing columns for production deployment

-- Add bio column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add custom_dictionary column to users table (for backward compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_dictionary JSONB DEFAULT '[]';

-- Add last_modified_at column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update trigger to also update last_modified_at
CREATE OR REPLACE FUNCTION update_project_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  NEW.last_modified_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_timestamps
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_project_timestamps();

-- Add comments
COMMENT ON COLUMN users.bio IS 'User biography/profile description';
COMMENT ON COLUMN users.custom_dictionary IS 'Custom dictionary words for spell-check (JSONB array)';
COMMENT ON COLUMN projects.last_modified_at IS 'Last time project data was modified';

SELECT 'Migration 024 completed' AS status;
