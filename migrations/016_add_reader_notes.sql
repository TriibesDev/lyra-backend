-- Migration 016: Add Notes Field to Reader Sessions
-- Adds a persistent notes field for beta readers to take project-wide notes

ALTER TABLE reader_sessions
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

COMMENT ON COLUMN reader_sessions.notes IS 'Project-wide notes field for the reader to track thoughts across all chapters';
