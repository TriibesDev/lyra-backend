-- Migration 027: Create all core project content tables
-- These tables store the actual manuscript content: chapters, scenes, characters, etc.

-- Chapters table
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  synopsis TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title TEXT,
  content JSONB, -- Quill Delta format
  synopsis TEXT,
  notes JSONB, -- Quill Delta format
  order_index INTEGER NOT NULL,
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Characters table
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description JSONB, -- Quill Delta format
  parent_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description JSONB, -- Quill Delta format
  parent_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Misc entities table (items, concepts, etc.)
CREATE TABLE IF NOT EXISTS misc_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description JSONB, -- Quill Delta format
  parent_id UUID REFERENCES misc_entities(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description JSONB, -- Quill Delta format
  parent_id UUID REFERENCES events(id) ON DELETE SET NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Relationships table
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  from_entity_id UUID NOT NULL,
  from_entity_type TEXT NOT NULL, -- 'character', 'location', 'misc', 'event'
  to_entity_id UUID NOT NULL,
  to_entity_type TEXT NOT NULL,
  relationship_type TEXT, -- Custom category
  description TEXT,
  strength INTEGER DEFAULT 5, -- 1-10 scale
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_entity_types CHECK (
    from_entity_type IN ('character', 'location', 'misc', 'event') AND
    to_entity_type IN ('character', 'location', 'misc', 'event')
  )
);

-- Story arcs table
CREATE TABLE IF NOT EXISTS story_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Arc scenes junction table (many-to-many)
CREATE TABLE IF NOT EXISTS arc_scenes (
  arc_id UUID NOT NULL REFERENCES story_arcs(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  PRIMARY KEY (arc_id, scene_id)
);

-- Character goals table
CREATE TABLE IF NOT EXISTS character_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Scene analysis table (for analysis frameworks)
CREATE TABLE IF NOT EXISTS scene_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  framework_name TEXT NOT NULL, -- 'five_commandments', 'value_shift', etc.
  analysis_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scene_id, framework_name)
);

-- Trash table (soft deletes for chapters, scenes, markers)
CREATE TABLE IF NOT EXISTS trash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'chapter', 'scene', 'marker'
  item_data JSONB NOT NULL, -- Original item data
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_from_chapter_id UUID,
  deleted_from_scene_id UUID,
  CONSTRAINT valid_item_type CHECK (item_type IN ('chapter', 'scene', 'marker'))
);

-- Create indexes for performance
CREATE INDEX idx_chapters_project ON chapters(project_id);
CREATE INDEX idx_chapters_order ON chapters(project_id, order_index);

CREATE INDEX idx_scenes_chapter ON scenes(chapter_id);
CREATE INDEX idx_scenes_project ON scenes(project_id);
CREATE INDEX idx_scenes_order ON scenes(chapter_id, order_index);

CREATE INDEX idx_characters_project ON characters(project_id);
CREATE INDEX idx_characters_parent ON characters(parent_id);
CREATE INDEX idx_characters_order ON characters(project_id, order_index);

CREATE INDEX idx_locations_project ON locations(project_id);
CREATE INDEX idx_locations_parent ON locations(parent_id);
CREATE INDEX idx_locations_order ON locations(project_id, order_index);

CREATE INDEX idx_misc_entities_project ON misc_entities(project_id);
CREATE INDEX idx_misc_entities_parent ON misc_entities(parent_id);
CREATE INDEX idx_misc_entities_order ON misc_entities(project_id, order_index);

CREATE INDEX idx_events_project ON events(project_id);
CREATE INDEX idx_events_parent ON events(parent_id);
CREATE INDEX idx_events_order ON events(project_id, order_index);

CREATE INDEX idx_relationships_project ON relationships(project_id);
CREATE INDEX idx_relationships_from ON relationships(from_entity_id, from_entity_type);
CREATE INDEX idx_relationships_to ON relationships(to_entity_id, to_entity_type);

CREATE INDEX idx_story_arcs_project ON story_arcs(project_id);
CREATE INDEX idx_story_arcs_order ON story_arcs(project_id, order_index);

CREATE INDEX idx_arc_scenes_arc ON arc_scenes(arc_id);
CREATE INDEX idx_arc_scenes_scene ON arc_scenes(scene_id);

CREATE INDEX idx_character_goals_scene ON character_goals(scene_id);
CREATE INDEX idx_character_goals_character ON character_goals(character_id);

CREATE INDEX idx_scene_analysis_scene ON scene_analysis(scene_id);
CREATE INDEX idx_scene_analysis_framework ON scene_analysis(framework_name);

CREATE INDEX idx_trash_project ON trash(project_id);
CREATE INDEX idx_trash_deleted_at ON trash(deleted_at);

-- Create update timestamp triggers
CREATE TRIGGER update_chapters_timestamp
  BEFORE UPDATE ON chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenes_timestamp
  BEFORE UPDATE ON scenes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_timestamp
  BEFORE UPDATE ON characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_timestamp
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_misc_entities_timestamp
  BEFORE UPDATE ON misc_entities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_timestamp
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_relationships_timestamp
  BEFORE UPDATE ON relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_story_arcs_timestamp
  BEFORE UPDATE ON story_arcs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_goals_timestamp
  BEFORE UPDATE ON character_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scene_analysis_timestamp
  BEFORE UPDATE ON scene_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE chapters IS 'Chapters within projects';
COMMENT ON TABLE scenes IS 'Scenes within chapters';
COMMENT ON TABLE characters IS 'Characters in the project with hierarchical support';
COMMENT ON TABLE locations IS 'Locations in the project with hierarchical support';
COMMENT ON TABLE misc_entities IS 'Misc items (objects, concepts, etc.) with hierarchical support';
COMMENT ON TABLE events IS 'Events/plot points with hierarchical support';
COMMENT ON TABLE relationships IS 'Relationships between entities (characters, locations, etc.)';
COMMENT ON TABLE story_arcs IS 'Story arcs that span multiple scenes';
COMMENT ON TABLE arc_scenes IS 'Junction table linking arcs to scenes';
COMMENT ON TABLE character_goals IS 'Character goals within specific scenes';
COMMENT ON TABLE scene_analysis IS 'Analysis framework data for scenes';
COMMENT ON TABLE trash IS 'Soft-deleted items (chapters, scenes, markers)';

SELECT 'Migration 027 completed - all core project tables created' AS status;
