-- Migration 016: Research Library System
-- Adds dedicated storage for research content separate from manuscript
-- Supports hierarchical folder structure, multiple file types, and cloud linking

-- Research Library Table
-- Stores research files and folders with hierarchical organization
CREATE TABLE IF NOT EXISTS research_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,

  -- Hierarchical structure
  folder_path TEXT NOT NULL DEFAULT '/', -- Path like '/Research/Characters/' or '/'
  file_name TEXT NOT NULL, -- Name of file or folder
  is_folder BOOLEAN DEFAULT false, -- true for folders, false for files

  -- File type and content
  file_type TEXT DEFAULT 'note', -- 'note', 'image', 'pdf', 'link', 'web_clip', 'folder'
  content JSONB, -- Quill Delta for notes, null for other types

  -- File storage options
  storage_type TEXT DEFAULT 'inline', -- 'inline', 'google_drive', 'dropbox', 'onedrive', 'local_link'
  storage_url TEXT, -- URL for cloud storage or local file path
  file_size_bytes BIGINT, -- Track file size for storage limits

  -- Metadata
  metadata JSONB DEFAULT '{}', -- {tags: [], source: '', dateAdded: '', description: '', etc.}
  original_chapter_id UUID, -- Track if converted from chapter (for reference)
  original_scene_id UUID, -- Track if converted from scene

  -- Ordering and organization
  sort_order INTEGER DEFAULT 0, -- Manual ordering within folders
  depth_level INTEGER DEFAULT 0, -- Track folder depth (0-4 limit enforced)

  -- Full-text search support
  searchable_text TEXT, -- Extracted text for search indexing

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE(project_id, folder_path, file_name),
  CONSTRAINT valid_file_type CHECK (file_type IN ('note', 'image', 'pdf', 'link', 'web_clip', 'folder')),
  CONSTRAINT valid_storage_type CHECK (storage_type IN ('inline', 'google_drive', 'dropbox', 'onedrive', 'local_link')),
  CONSTRAINT max_depth_level CHECK (depth_level >= 0 AND depth_level <= 4)
);

-- Indexes for performance
CREATE INDEX idx_research_library_project ON research_library(project_id);
CREATE INDEX idx_research_library_folder_path ON research_library(folder_path);
CREATE INDEX idx_research_library_is_folder ON research_library(is_folder);
CREATE INDEX idx_research_library_file_type ON research_library(file_type);
CREATE INDEX idx_research_library_sort_order ON research_library(project_id, folder_path, sort_order);
CREATE INDEX idx_research_library_depth ON research_library(depth_level);

-- Full-text search index
CREATE INDEX idx_research_library_search ON research_library USING gin(to_tsvector('english', COALESCE(searchable_text, '')));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_research_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_research_library_timestamp
  BEFORE UPDATE ON research_library
  FOR EACH ROW
  EXECUTE FUNCTION update_research_library_updated_at();

-- Trigger to extract searchable text from content
CREATE OR REPLACE FUNCTION extract_research_searchable_text()
RETURNS TRIGGER AS $$
BEGIN
  -- For notes with Quill Delta content, extract plain text
  IF NEW.file_type = 'note' AND NEW.content IS NOT NULL THEN
    -- Extract text from Quill Delta ops array
    NEW.searchable_text := (
      SELECT string_agg(COALESCE(op->>'insert', ''), ' ')
      FROM jsonb_array_elements(NEW.content->'ops') AS op
      WHERE op ? 'insert'
    );
  END IF;

  -- Combine file name and metadata for searchability
  NEW.searchable_text := COALESCE(NEW.searchable_text, '') || ' ' ||
                         NEW.file_name || ' ' ||
                         COALESCE(NEW.metadata->>'description', '') || ' ' ||
                         COALESCE(NEW.metadata->>'tags', '')::text;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER extract_research_text
  BEFORE INSERT OR UPDATE ON research_library
  FOR EACH ROW
  EXECUTE FUNCTION extract_research_searchable_text();

-- Trigger to calculate depth_level from folder_path
CREATE OR REPLACE FUNCTION calculate_depth_level()
RETURNS TRIGGER AS $$
BEGIN
  -- Count slashes to determine depth (/ = 0, /Folder/ = 1, /Folder/Sub/ = 2)
  NEW.depth_level := array_length(string_to_array(trim(both '/' from NEW.folder_path), '/'), 1);

  -- Root level should be 0
  IF NEW.folder_path = '/' THEN
    NEW.depth_level := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_depth_level
  BEFORE INSERT OR UPDATE OF folder_path ON research_library
  FOR EACH ROW
  EXECUTE FUNCTION calculate_depth_level();

-- Comments
COMMENT ON TABLE research_library IS 'Research and reference materials organized in hierarchical folders';
COMMENT ON COLUMN research_library.folder_path IS 'Hierarchical path like /Research/Characters/ (max depth: 4)';
COMMENT ON COLUMN research_library.file_type IS 'Type of content: note, image, pdf, link, web_clip, folder';
COMMENT ON COLUMN research_library.content IS 'Quill Delta format for notes; null for other file types';
COMMENT ON COLUMN research_library.storage_type IS 'Where file is stored: inline, cloud service, or local link';
COMMENT ON COLUMN research_library.storage_url IS 'URL or path for cloud/local storage';
COMMENT ON COLUMN research_library.metadata IS 'JSON object with tags, source, description, etc.';
COMMENT ON COLUMN research_library.original_chapter_id IS 'Reference to original chapter if converted from manuscript';
COMMENT ON COLUMN research_library.searchable_text IS 'Auto-extracted text for full-text search';
COMMENT ON COLUMN research_library.depth_level IS 'Folder nesting depth (0-4, auto-calculated)';
