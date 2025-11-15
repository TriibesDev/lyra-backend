// routes/chapters.js
// API routes for normalized chapters and scenes tables

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

// ============================================================================
// CHAPTERS ROUTES
// ============================================================================

// @route   GET api/chapters/:projectId
// @desc    Get all chapters for a project with their scenes
// @access  Private
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get all chapters with their scenes in hierarchical structure
    const chapters = await db.query(`
      WITH RECURSIVE chapter_tree AS (
        -- Top-level chapters
        SELECT
          c.id,
          c.project_id,
          c.parent_id,
          c.name,
          c.type,
          c.sort_order,
          c.created_at,
          c.updated_at,
          0 as level,
          ARRAY[c.sort_order] as path
        FROM chapters c
        WHERE c.project_id = $1 AND c.parent_id IS NULL

        UNION ALL

        -- Child chapters
        SELECT
          c.id,
          c.project_id,
          c.parent_id,
          c.name,
          c.type,
          c.sort_order,
          c.created_at,
          c.updated_at,
          ct.level + 1,
          ct.path || c.sort_order
        FROM chapters c
        JOIN chapter_tree ct ON c.parent_id = ct.id
        WHERE c.project_id = $1
      )
      SELECT
        ct.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'synopsis', s.synopsis,
              'notes', s.notes,
              'sort_order', s.sort_order,
              'word_count', s.word_count,
              'created_at', s.created_at,
              'updated_at', s.updated_at
            ) ORDER BY s.sort_order
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) as scenes
      FROM chapter_tree ct
      LEFT JOIN scenes s ON s.chapter_id = ct.id
      GROUP BY ct.id, ct.project_id, ct.parent_id, ct.name, ct.type, ct.sort_order, ct.created_at, ct.updated_at, ct.level, ct.path
      ORDER BY ct.path
    `, [projectId]);

    res.json(chapters.rows);
  } catch (err) {
    console.error('Error fetching chapters:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// @route   POST api/chapters
// @desc    Create a new chapter
// @access  Private
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { project_id, parent_id, name, type, sort_order } = req.body;

    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [project_id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const newChapter = await db.query(
      `INSERT INTO chapters (project_id, parent_id, name, type, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project_id, parent_id || null, name, type || 'main', sort_order || 0]
    );

    res.status(201).json(newChapter.rows[0]);
  } catch (err) {
    console.error('Error creating chapter:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// @route   PUT api/chapters/:id
// @desc    Update a chapter
// @access  Private
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, sort_order, parent_id } = req.body;

    // Verify user owns this chapter
    const chapterCheck = await db.query(`
      SELECT c.id, p.user_id
      FROM chapters c
      JOIN projects p ON p.project_id = c.project_id
      WHERE c.id = $1
    `, [id]);

    if (chapterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (chapterCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updatedChapter = await db.query(
      `UPDATE chapters
       SET name = COALESCE($1, name),
           type = COALESCE($2, type),
           sort_order = COALESCE($3, sort_order),
           parent_id = $4
       WHERE id = $5
       RETURNING *`,
      [name, type, sort_order, parent_id, id]
    );

    res.json(updatedChapter.rows[0]);
  } catch (err) {
    console.error('Error updating chapter:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// @route   DELETE api/chapters/:id
// @desc    Delete a chapter and all its scenes
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user owns this chapter
    const chapterCheck = await db.query(`
      SELECT c.id, p.user_id, c.project_id
      FROM chapters c
      JOIN projects p ON p.project_id = c.project_id
      WHERE c.id = $1
    `, [id]);

    if (chapterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (chapterCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete will cascade to scenes via ON DELETE CASCADE
    await db.query('DELETE FROM chapters WHERE id = $1', [id]);

    res.json({ message: 'Chapter deleted successfully' });
  } catch (err) {
    console.error('Error deleting chapter:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ============================================================================
// SCENES ROUTES
// ============================================================================

// @route   GET api/chapters/:chapterId/scenes
// @desc    Get all scenes for a chapter
// @access  Private
router.get('/:chapterId/scenes', authenticateToken, async (req, res) => {
  try {
    const { chapterId } = req.params;

    // Verify user owns this chapter
    const chapterCheck = await db.query(`
      SELECT c.id, p.user_id
      FROM chapters c
      JOIN projects p ON p.project_id = c.project_id
      WHERE c.id = $1
    `, [chapterId]);

    if (chapterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (chapterCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const scenes = await db.query(
      `SELECT * FROM scenes WHERE chapter_id = $1 ORDER BY sort_order`,
      [chapterId]
    );

    res.json(scenes.rows);
  } catch (err) {
    console.error('Error fetching scenes:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// @route   POST api/chapters/:chapterId/scenes
// @desc    Create a new scene
// @access  Private
router.post('/:chapterId/scenes', authenticateToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { synopsis, notes, sort_order } = req.body;

    // Verify user owns this chapter
    const chapterCheck = await db.query(`
      SELECT c.id, p.user_id
      FROM chapters c
      JOIN projects p ON p.project_id = c.project_id
      WHERE c.id = $1
    `, [chapterId]);

    if (chapterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (chapterCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Calculate word count from notes
    let wordCount = 0;
    if (notes && notes.ops) {
      notes.ops.forEach(op => {
        if (typeof op.insert === 'string') {
          const text = op.insert.trim();
          if (text) {
            wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
          }
        }
      });
    }

    const newScene = await db.query(
      `INSERT INTO scenes (chapter_id, synopsis, notes, sort_order, word_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [chapterId, synopsis || '', JSON.stringify(notes), sort_order || 0, wordCount]
    );

    res.status(201).json(newScene.rows[0]);
  } catch (err) {
    console.error('Error creating scene:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// @route   PUT api/chapters/scenes/:sceneId
// @desc    Update a scene
// @access  Private
router.put('/scenes/:sceneId', authenticateToken, async (req, res) => {
  try {
    const { sceneId } = req.params;
    const { synopsis, notes, sort_order } = req.body;

    // Verify user owns this scene
    const sceneCheck = await db.query(`
      SELECT s.id, p.user_id
      FROM scenes s
      JOIN chapters c ON c.id = s.chapter_id
      JOIN projects p ON p.project_id = c.project_id
      WHERE s.id = $1
    `, [sceneId]);

    if (sceneCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    if (sceneCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Calculate word count if notes provided
    let wordCount = null;
    if (notes && notes.ops) {
      wordCount = 0;
      notes.ops.forEach(op => {
        if (typeof op.insert === 'string') {
          const text = op.insert.trim();
          if (text) {
            wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
          }
        }
      });
    }

    const updatedScene = await db.query(
      `UPDATE scenes
       SET synopsis = COALESCE($1, synopsis),
           notes = COALESCE($2, notes),
           sort_order = COALESCE($3, sort_order),
           word_count = COALESCE($4, word_count)
       WHERE id = $5
       RETURNING *`,
      [synopsis, notes ? JSON.stringify(notes) : null, sort_order, wordCount, sceneId]
    );

    res.json(updatedScene.rows[0]);
  } catch (err) {
    console.error('Error updating scene:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// @route   DELETE api/chapters/scenes/:sceneId
// @desc    Delete a scene
// @access  Private
router.delete('/scenes/:sceneId', authenticateToken, async (req, res) => {
  try {
    const { sceneId } = req.params;

    // Verify user owns this scene
    const sceneCheck = await db.query(`
      SELECT s.id, p.user_id
      FROM scenes s
      JOIN chapters c ON c.id = s.chapter_id
      JOIN projects p ON p.project_id = c.project_id
      WHERE s.id = $1
    `, [sceneId]);

    if (sceneCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    if (sceneCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await db.query('DELETE FROM scenes WHERE id = $1', [sceneId]);

    res.json({ message: 'Scene deleted successfully' });
  } catch (err) {
    console.error('Error deleting scene:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
