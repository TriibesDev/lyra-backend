-- Migration: Add scratchpad preferences to user_preferences table
-- Description: Adds columns for storing scratchpad content and position

-- Add scratchpad_content column (stores the user's scratchpad notes)
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS scratchpad_content TEXT DEFAULT '';

-- Add scratchpad_position column (stores the scratchpad window position as JSON)
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS scratchpad_position JSONB DEFAULT '{"x": 50, "y": 100}'::jsonb;

-- Update the updated_at trigger is already in place, no need to add it again
