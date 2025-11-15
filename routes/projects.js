// routes/projects.js
const express = require('express');
const router = express.Router();
// 💡 FIX: Destructure the import to get the authenticateToken function
const { authenticateToken } = require('../middleware/auth');
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

// @route   GET api/projects
// @desc    Get all projects for a user
// @access  Private
// 💡 FIX: Use the authenticateToken function as middleware
router.get('/', authenticateToken, async (req, res) => {
  try {
    const projects = await db.query(
      'SELECT project_id, title, last_modified_at, last_accessed, word_count, chapter_count, scene_count, character_count, archived, archived_at, is_draft, parent_project_id FROM projects WHERE user_id = $1 AND deleted_at IS NULL ORDER BY last_accessed DESC',
      [req.user.user_id]
    );
    res.json(projects.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects
// @desc    Create a new project
// @access  Private
// 💡 FIX: Use the authenticateToken function as middleware
router.post('/', authenticateToken, async (req, res) => {
  const { title, project_data, is_draft, parent_project_id } = req.body;
  try {
    console.log('Creating project with title:', title);
    console.log('project_data type:', typeof project_data);
    console.log('project_data keys:', project_data ? Object.keys(project_data) : 'null');
    console.log('is_draft:', is_draft);
    console.log('parent_project_id:', parent_project_id);

    // Calculate stats
    const stats = calculateProjectStats(project_data);

    const newProject = await db.query(
      'INSERT INTO projects (user_id, title, project_data, word_count, chapter_count, scene_count, character_count, is_draft, parent_project_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [req.user.user_id, title, JSON.stringify(project_data), stats.word_count, stats.chapter_count, stats.scene_count, stats.character_count, is_draft || false, parent_project_id || null]
    );
    res.status(201).json(newProject.rows[0]);
  } catch (err) {
    console.error('Error creating project:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ error: err.message, details: err.toString() });
  }
});

// @route   GET api/projects/:id/minimal
// @desc    Get minimal project data for fast initial load (only first chapter or specified chapter)
// @access  Private
router.get('/:id/minimal', authenticateToken, async (req, res) => {
    try {
        const { chapterId } = req.query; // Optional: load specific chapter

        // Update last_accessed timestamp
        await db.query(
            'UPDATE projects SET last_accessed = NOW() WHERE project_id = $1 AND user_id = $2',
            [req.params.id, req.user.user_id]
        );

        const project = await db.query(
            'SELECT * FROM projects WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [req.params.id, req.user.user_id]
        );

        if (project.rows.length === 0) {
            return res.status(404).json({ msg: 'Project not found' });
        }

        const fullData = project.rows[0].project_data;

        // Extract only the essential data for initial render
        const minimalData = {
            settings: fullData.settings || {},
            characters: fullData.characters || [],
            locations: fullData.locations || [],
            misc: fullData.misc || [],
            events: fullData.events || [],
            relationships: fullData.relationships || [],
            arcs: fullData.arcs || [],
            trash: fullData.trash || []
        };

        // Determine which chapter to load
        let targetChapterId = chapterId;
        if (!targetChapterId && fullData.settings?.lastActiveChapterId) {
            targetChapterId = fullData.settings.lastActiveChapterId;
        }

        const chapters = fullData.chapters || [];
        let chapterToLoad = null;

        if (targetChapterId) {
            chapterToLoad = chapters.find(ch => ch.id === targetChapterId);
        }

        // If not found or not specified, load first chapter
        if (!chapterToLoad && chapters.length > 0) {
            chapterToLoad = chapters[0];
        }

        // Return minimal project with only one chapter
        minimalData.chapters = chapterToLoad ? [chapterToLoad] : [];

        // Include metadata about what's been loaded
        const response = {
            project_id: project.rows[0].project_id,
            title: project.rows[0].title,
            last_modified_at: project.rows[0].last_modified_at,
            project_data: minimalData,
            _meta: {
                totalChapters: chapters.length,
                loadedChapterIds: chapterToLoad ? [chapterToLoad.id] : [],
                isPartialLoad: true
            }
        };

        res.json(response);
    } catch (err) {
        console.error('Error loading minimal project:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/projects/:id
// @desc    Get a single project by its ID
// @access  Private
// 💡 FIX: Use the authenticateToken function as middleware
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        // Update last_accessed timestamp
        await db.query(
            'UPDATE projects SET last_accessed = NOW() WHERE project_id = $1 AND user_id = $2',
            [req.params.id, req.user.user_id]
        );

        const project = await db.query(
            'SELECT * FROM projects WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [req.params.id, req.user.user_id]
        );

        if (project.rows.length === 0) {
            return res.status(404).json({ msg: 'Project not found' });
        }
        res.json(project.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/projects/:id/chapters/:chapterIds
// @desc    Get specific chapters by IDs (for lazy loading)
// @access  Private
router.get('/:id/chapters/:chapterIds', authenticateToken, async (req, res) => {
    try {
        const { chapterIds } = req.params; // Comma-separated chapter IDs

        const project = await db.query(
            'SELECT project_data FROM projects WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [req.params.id, req.user.user_id]
        );

        if (project.rows.length === 0) {
            return res.status(404).json({ msg: 'Project not found' });
        }

        const fullData = project.rows[0].project_data;
        const chapters = fullData.chapters || [];
        const requestedIds = chapterIds.split(',');

        const requestedChapters = chapters.filter(ch => requestedIds.includes(ch.id));

        res.json({ chapters: requestedChapters });
    } catch (err) {
        console.error('Error loading chapters:', err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/projects/:id
// @desc    Update a project
// @access  Private
// 💡 FIX: Use the authenticateToken function as middleware
router.put('/:id', authenticateToken, async (req, res) => {
    const { title, project_data, archived, archived_at } = req.body;
    try {
        // Calculate stats
        const stats = calculateProjectStats(project_data);

        // Build dynamic UPDATE query to handle optional archived fields
        let query = 'UPDATE projects SET title = $1, project_data = $2, last_modified_at = NOW(), word_count = $3, chapter_count = $4, scene_count = $5, character_count = $6';
        let params = [title, JSON.stringify(project_data), stats.word_count, stats.chapter_count, stats.scene_count, stats.character_count];
        let paramIndex = 7;

        if (archived !== undefined) {
            query += `, archived = $${paramIndex}`;
            params.push(archived);
            paramIndex++;
        }

        if (archived_at !== undefined) {
            query += `, archived_at = $${paramIndex}`;
            params.push(archived_at);
            paramIndex++;
        }

        query += ` WHERE project_id = $${paramIndex} AND user_id = $${paramIndex + 1} AND deleted_at IS NULL RETURNING *`;
        params.push(req.params.id, req.user.user_id);

        const updatedProject = await db.query(query, params);

        if (updatedProject.rows.length === 0) {
            return res.status(404).json({ msg: 'Project not found or user not authorized' });
        }
        res.json(updatedProject.rows[0]);
    } catch (err) {
        console.error('Error updating project:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// @route   DELETE api/projects/:projectId
// @desc    Soft-delete a project (move to trash)
// @access  Private
router.delete('/:projectId', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.user_id;

  try {
    const result = await db.query(
      'UPDATE projects SET deleted_at = NOW() WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found or user not authorized.' });
    }

    res.json({ message: 'Project moved to trash successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/trash/all
// @desc    Get all deleted projects (in trash)
// @access  Private
router.get('/trash/all', authenticateToken, async (req, res) => {
  try {
    const projects = await db.query(
      'SELECT project_id, title, last_modified_at, deleted_at FROM projects WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      [req.user.user_id]
    );
    res.json(projects.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/:projectId/restore
// @desc    Restore a project from trash
// @access  Private
router.post('/:projectId/restore', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.user_id;

  try {
    const result = await db.query(
      'UPDATE projects SET deleted_at = NULL WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
      [projectId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found in trash or user not authorized.' });
    }

    res.json({ message: 'Project restored successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/projects/:projectId/permanent
// @desc    Permanently delete a project (hard delete)
// @access  Private
router.delete('/:projectId/permanent', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.user_id;

  try {
    const result = await db.query(
      'DELETE FROM projects WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found or user not authorized.' });
    }

    res.json({ message: 'Project permanently deleted.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ==================== SESSION MANAGEMENT ROUTES ====================

// @route   POST api/projects/:projectId/sessions
// @desc    Register a new editing session for concurrent editing detection
// @access  Private
router.post('/:projectId/sessions', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.user_id;
  const { browserName, browserVersion, osName, deviceType, userAgent } = req.body;

  try {
    // Verify project belongs to user
    const project = await db.query(
      'SELECT project_id FROM projects WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Create new session
    const { v4: uuidv4 } = require('uuid');
    const sessionId = uuidv4();

    await db.query(
      `INSERT INTO project_sessions
       (session_id, project_id, user_id, last_heartbeat, browser_name, browser_version, os_name, device_type, user_agent)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)`,
      [sessionId, projectId, userId, browserName, browserVersion, osName, deviceType, userAgent]
    );

    // Get other active sessions (within last 2 minutes)
    const otherSessions = await db.query(
      `SELECT session_id, last_heartbeat, browser_name, browser_version, os_name, device_type
       FROM project_sessions
       WHERE project_id = $1
       AND session_id != $2
       AND last_heartbeat > NOW() - INTERVAL '2 minutes'
       ORDER BY last_heartbeat DESC`,
      [projectId, sessionId]
    );

    res.json({
      sessionId,
      otherActiveSessions: otherSessions.rows.map(row => ({
        sessionId: row.session_id,
        lastHeartbeat: row.last_heartbeat,
        browserName: row.browser_name,
        browserVersion: row.browser_version,
        osName: row.os_name,
        deviceType: row.device_type
      }))
    });
  } catch (err) {
    console.error('Error registering session:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   PATCH api/projects/:projectId/sessions/:sessionId/heartbeat
// @desc    Update session heartbeat timestamp
// @access  Private
router.patch('/:projectId/sessions/:sessionId/heartbeat', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.user_id;

  try {
    const result = await db.query(
      'UPDATE project_sessions SET last_heartbeat = NOW() WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating heartbeat:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE api/projects/:projectId/sessions/:sessionId
// @desc    Close an editing session
// @access  Private
router.delete('/:projectId/sessions/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.user_id;

  try {
    await db.query(
      'DELETE FROM project_sessions WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error closing session:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE api/projects/:projectId/sessions/:sessionId/force
// @desc    Force close any session for a project (owner only)
// @access  Private
router.delete('/:projectId/sessions/:sessionId/force', authenticateToken, async (req, res) => {
  const { projectId, sessionId } = req.params;
  const userId = req.user.user_id;

  try {
    // Verify project belongs to user (only owner can force close sessions)
    const project = await db.query(
      'SELECT project_id FROM projects WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    // Delete the session (doesn't need to match user_id since owner is forcing close)
    const result = await db.query(
      'DELETE FROM project_sessions WHERE session_id = $1 AND project_id = $2',
      [sessionId, projectId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`[Session] User ${userId} force closed session ${sessionId} for project ${projectId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error force closing session:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   GET api/projects/:projectId/sessions
// @desc    Get all active sessions for a project
// @access  Private
router.get('/:projectId/sessions', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.user_id;

  try {
    // Verify project belongs to user
    const project = await db.query(
      'SELECT project_id FROM projects WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get active sessions (within last 2 minutes)
    const sessions = await db.query(
      `SELECT session_id, last_heartbeat, browser_name, browser_version, os_name, device_type
       FROM project_sessions
       WHERE project_id = $1
       AND last_heartbeat > NOW() - INTERVAL '2 minutes'
       ORDER BY last_heartbeat DESC`,
      [projectId]
    );

    res.json({
      sessions: sessions.rows.map(row => ({
        sessionId: row.session_id,
        lastHeartbeat: row.last_heartbeat,
        browserName: row.browser_name,
        browserVersion: row.browser_version,
        osName: row.os_name,
        deviceType: row.device_type
      }))
    });
  } catch (err) {
    console.error('Error fetching sessions:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SHADOW BACKUP ROUTES ====================

// @route   PUT api/projects/shadow/:localProjectId
// @desc    Create or update shadow backup of local project
// @access  Private
router.put('/shadow/:localProjectId', authenticateToken, async (req, res) => {
  const { localProjectId } = req.params;
  const userId = req.user.user_id;
  const projectData = req.body;

  try {
    // Check if shadow backup already exists
    const existing = await db.query(
      'SELECT local_project_id FROM shadow_backups WHERE local_project_id = $1 AND user_id = $2',
      [localProjectId, userId]
    );

    if (existing.rows.length > 0) {
      // Update existing shadow backup
      await db.query(
        'UPDATE shadow_backups SET project_data = $1, updated_at = NOW() WHERE local_project_id = $2 AND user_id = $3',
        [JSON.stringify(projectData), localProjectId, userId]
      );
    } else {
      // Create new shadow backup
      await db.query(
        'INSERT INTO shadow_backups (local_project_id, user_id, project_data) VALUES ($1, $2, $3)',
        [localProjectId, userId, JSON.stringify(projectData)]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving shadow backup:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// @route   GET api/projects/shadow/:localProjectId
// @desc    Get shadow backup of local project
// @access  Private
router.get('/shadow/:localProjectId', authenticateToken, async (req, res) => {
  const { localProjectId } = req.params;
  const userId = req.user.user_id;

  try {
    const backup = await db.query(
      'SELECT project_data, created_at, updated_at FROM shadow_backups WHERE local_project_id = $1 AND user_id = $2',
      [localProjectId, userId]
    );

    if (backup.rows.length === 0) {
      return res.status(404).json({ error: 'Shadow backup not found' });
    }

    res.json(backup.rows[0].project_data);
  } catch (err) {
    console.error('Error fetching shadow backup:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;