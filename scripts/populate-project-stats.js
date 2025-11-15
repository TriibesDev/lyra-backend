// Script to populate stats for existing projects
require('dotenv').config();
const db = require('../db');

// Helper function to calculate project statistics
function calculateProjectStats(projectData) {
  const stats = {
    word_count: 0,
    chapter_count: 0,
    scene_count: 0,
    character_count: 0
  };

  if (!projectData) return stats;

  // Count chapters
  stats.chapter_count = projectData.chapters?.length || 0;

  // Count scenes and words
  if (projectData.chapters) {
    projectData.chapters.forEach(chapter => {
      if (chapter.scenes) {
        stats.scene_count += chapter.scenes.length;

        chapter.scenes.forEach(scene => {
          if (scene.notes) {
            // Handle both string and Delta format
            if (typeof scene.notes === 'string') {
              // Plain text - simple word count
              stats.word_count += scene.notes.trim().split(/\s+/).filter(w => w.length > 0).length;
            } else if (scene.notes.ops) {
              // Delta format - extract text from ops
              scene.notes.ops.forEach(op => {
                if (typeof op.insert === 'string') {
                  const text = op.insert.trim();
                  if (text) {
                    stats.word_count += text.split(/\s+/).filter(w => w.length > 0).length;
                  }
                }
              });
            }
          }
        });
      }
    });
  }

  // Count characters
  stats.character_count = projectData.characters?.length || 0;

  return stats;
}

async function populateStats() {
  try {
    console.log('Fetching all projects...');
    const result = await db.query('SELECT project_id, project_data FROM projects WHERE deleted_at IS NULL');
    const projects = result.rows;

    console.log(`Found ${projects.length} projects to process`);

    let updatedCount = 0;

    for (const project of projects) {
      const stats = calculateProjectStats(project.project_data);

      await db.query(
        'UPDATE projects SET word_count = $1, chapter_count = $2, scene_count = $3, character_count = $4 WHERE project_id = $5',
        [stats.word_count, stats.chapter_count, stats.scene_count, stats.character_count, project.project_id]
      );

      updatedCount++;
      console.log(`Updated project ${project.project_id}: ${stats.word_count} words, ${stats.chapter_count} chapters, ${stats.scene_count} scenes, ${stats.character_count} characters`);
    }

    console.log(`\nSuccessfully updated stats for ${updatedCount} projects!`);
    process.exit(0);
  } catch (error) {
    console.error('Error populating stats:', error);
    process.exit(1);
  }
}

populateStats();
