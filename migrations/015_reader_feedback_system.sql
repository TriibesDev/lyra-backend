-- Migration 015: Reader Feedback System (Beta Reader Feature)
-- This enables authors to invite beta readers to review chapters and provide feedback

-- Reader Invitations Table
-- Stores invitations sent to beta readers with access tokens
CREATE TABLE IF NOT EXISTS reader_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Access control
  access_token VARCHAR(255) UNIQUE NOT NULL, -- Secure token for reader access
  chapters_accessible JSONB NOT NULL, -- Array of chapter IDs: ["chapter-uuid-1", "chapter-uuid-2"]

  -- Invitation details
  invitation_message TEXT, -- Custom message from author
  reader_name VARCHAR(255), -- Reader's name (optional, GDPR-safe - stored for author's reference only)
  reader_email VARCHAR(255), -- Email (temporary, for sending invite only - can be deleted after sent)

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, expired, revoked
  accepted_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- Reader Feedback Sessions Table
-- Tracks reader activity and progress
CREATE TABLE IF NOT EXISTS reader_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES reader_invitations(id) ON DELETE CASCADE,

  -- Progress tracking
  chapters_read JSONB DEFAULT '[]', -- Array of chapter IDs reader has viewed
  last_chapter_id UUID, -- Last chapter the reader was viewing
  completion_percentage INTEGER DEFAULT 0, -- 0-100

  -- Activity timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reader Markers Table
-- Stores annotations, comments, highlights from beta readers
CREATE TABLE IF NOT EXISTS reader_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES reader_invitations(id) ON DELETE CASCADE,

  -- Location in manuscript
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  chapter_id VARCHAR(255) NOT NULL, -- Chapter UUID as string
  scene_id VARCHAR(255) NOT NULL, -- Scene UUID as string

  -- Marker data (same format as regular markers)
  marker_id VARCHAR(255) NOT NULL, -- UUID for the marker itself
  marker_type VARCHAR(50) DEFAULT 'note', -- note, question, suggestion, highlight
  marker_text TEXT, -- The reader's comment/note

  -- Context
  highlighted_text TEXT, -- The text the reader highlighted/referenced
  position_data JSONB, -- Quill Delta position/range data

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- For imported markers
  imported_to_project BOOLEAN DEFAULT false,
  imported_at TIMESTAMP,

  CONSTRAINT valid_marker_type CHECK (marker_type IN ('note', 'question', 'suggestion', 'highlight', 'revision'))
);

-- Indexes for performance
CREATE INDEX idx_reader_invitations_project ON reader_invitations(project_id);
CREATE INDEX idx_reader_invitations_token ON reader_invitations(access_token);
CREATE INDEX idx_reader_invitations_status ON reader_invitations(status);
CREATE INDEX idx_reader_invitations_expires ON reader_invitations(expires_at);

CREATE INDEX idx_reader_sessions_invitation ON reader_sessions(invitation_id);

CREATE INDEX idx_reader_markers_invitation ON reader_markers(invitation_id);
CREATE INDEX idx_reader_markers_project ON reader_markers(project_id);
CREATE INDEX idx_reader_markers_scene ON reader_markers(scene_id);
CREATE INDEX idx_reader_markers_imported ON reader_markers(imported_to_project);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reader_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reader_invitations_updated_at
  BEFORE UPDATE ON reader_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_reader_updated_at();

CREATE TRIGGER update_reader_markers_updated_at
  BEFORE UPDATE ON reader_markers
  FOR EACH ROW
  EXECUTE FUNCTION update_reader_updated_at();

-- Trigger to update last_activity_at on session updates
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reader_sessions_activity
  BEFORE UPDATE ON reader_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- Comments
COMMENT ON TABLE reader_invitations IS 'Beta reader invitations with access tokens and expiration dates';
COMMENT ON TABLE reader_sessions IS 'Tracks beta reader progress and activity';
COMMENT ON TABLE reader_markers IS 'Annotations and comments from beta readers';

COMMENT ON COLUMN reader_invitations.access_token IS 'Secure token for reader access (no login required)';
COMMENT ON COLUMN reader_invitations.chapters_accessible IS 'JSON array of chapter UUIDs the reader can access';
COMMENT ON COLUMN reader_invitations.reader_email IS 'Temporary storage for sending invite; can be deleted after sent for GDPR compliance';
COMMENT ON COLUMN reader_markers.highlighted_text IS 'The actual text from the manuscript the reader referenced';
COMMENT ON COLUMN reader_markers.position_data IS 'Quill Delta position data for precise highlighting';
