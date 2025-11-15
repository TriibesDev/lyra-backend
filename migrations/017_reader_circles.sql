-- Migration: Reader Circles Enhancement
-- Adds circle naming, archiving, and reader contacts for acknowledgements

-- Add circle management columns to reader_invitations
ALTER TABLE reader_invitations
ADD COLUMN circle_name VARCHAR(255),
ADD COLUMN archived BOOLEAN DEFAULT false,
ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Create index for faster archived queries
CREATE INDEX idx_reader_invitations_archived ON reader_invitations(archived);

-- Update existing invitations with default circle names based on creation date
UPDATE reader_invitations
SET circle_name = 'Draft Review - ' || TO_CHAR(created_at, 'Mon DD, YYYY')
WHERE circle_name IS NULL;

-- Make circle_name NOT NULL after setting defaults
ALTER TABLE reader_invitations
ALTER COLUMN circle_name SET NOT NULL;

-- Create reader_contacts table for acknowledgements
CREATE TABLE reader_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reader_name VARCHAR(255) NOT NULL,
  reader_email VARCHAR(255) NOT NULL,
  first_feedback_date TIMESTAMP DEFAULT NOW(),
  last_feedback_date TIMESTAMP DEFAULT NOW(),
  total_annotations INTEGER DEFAULT 0,
  projects_reviewed TEXT[], -- Array of project titles
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, reader_email)
);

-- Create index for faster lookups
CREATE INDEX idx_reader_contacts_user_email ON reader_contacts(user_id, reader_email);

-- Populate reader_contacts from existing accepted invitations with feedback
INSERT INTO reader_contacts (user_id, reader_name, reader_email, first_feedback_date, last_feedback_date, total_annotations, projects_reviewed)
SELECT
  ri.user_id,
  ri.reader_name,
  ri.reader_email,
  MIN(ri.accepted_at) as first_feedback_date,
  MAX(ri.last_activity_at) as last_feedback_date,
  SUM((SELECT COUNT(*) FROM reader_markers WHERE invitation_id = ri.id)) as total_annotations,
  ARRAY_AGG(DISTINCT p.title) as projects_reviewed
FROM reader_invitations ri
JOIN projects p ON p.project_id = ri.project_id
WHERE ri.status = 'accepted'
GROUP BY ri.user_id, ri.reader_name, ri.reader_email
ON CONFLICT (user_id, reader_email) DO NOTHING;

-- Add comment
COMMENT ON TABLE reader_contacts IS 'Stores reader contact information for acknowledgements and future invitations';
