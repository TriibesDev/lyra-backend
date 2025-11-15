-- Migration 020: Add project statistics columns
-- Stores calculated stats to avoid recalculation on dashboard load

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chapter_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS scene_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS character_count INTEGER DEFAULT 0;

-- Create index for faster queries (optional, useful for sorting by word count)
CREATE INDEX IF NOT EXISTS idx_projects_word_count ON projects(word_count);
