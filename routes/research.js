// routes/research.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const imageService = require('../services/imageService');

// Helper function to extract text from Quill Delta
function extractTextFromDelta(content) {
  if (!content || !content.ops) return '';
  return content.ops
    .filter(op => typeof op.insert === 'string')
    .map(op => op.insert)
    .join(' ')
    .trim();
}

// Helper function to calculate folder depth
function calculateDepth(folderPath) {
  if (folderPath === '/') return 0;
  return folderPath.split('/').filter(p => p.length > 0).length;
}

// Get all research items for a project (with optional folder filter)
// GET /api/research/:projectId?folder=/Research/
router.get('/:projectId', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { folder } = req.query;

  try {
    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build query based on folder filter
    let query, params;
    if (folder) {
      query = `
        SELECT * FROM research_library
        WHERE project_id = $1 AND folder_path = $2
        ORDER BY is_folder DESC, sort_order ASC, file_name ASC
      `;
      params = [projectId, folder];
    } else {
      query = `
        SELECT * FROM research_library
        WHERE project_id = $1
        ORDER BY folder_path ASC, is_folder DESC, sort_order ASC, file_name ASC
      `;
      params = [projectId];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching research items:', error);
    res.status(500).json({ error: 'Failed to fetch research items' });
  }
});

// Get a specific research item
// GET /api/research/:projectId/item/:itemId
router.get('/:projectId/item/:itemId', authenticateToken, async (req, res) => {
  const { projectId, itemId } = req.params;

  try {
    // Verify user owns this project and get the item
    const result = await db.query(
      `SELECT r.* FROM research_library r
       JOIN projects p ON r.project_id = p.project_id
       WHERE r.id = $1 AND r.project_id = $2 AND p.user_id = $3`,
      [itemId, projectId, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Research item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching research item:', error);
    res.status(500).json({ error: 'Failed to fetch research item' });
  }
});

// Create a new research item (file or folder)
// POST /api/research/:projectId
router.post('/:projectId', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const {
    folder_path = '/',
    file_name,
    is_folder = false,
    file_type = 'note',
    content,
    storage_type = 'inline',
    storage_url,
    file_size_bytes,
    metadata = {},
    sort_order = 0
  } = req.body;

  try {
    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate depth limit
    const depth = calculateDepth(folder_path);
    if (depth > 4) {
      return res.status(400).json({ error: 'Maximum folder depth (4) exceeded' });
    }

    // Insert the new item
    const result = await db.query(
      `INSERT INTO research_library (
        project_id, folder_path, file_name, is_folder, file_type,
        content, storage_type, storage_url, file_size_bytes,
        metadata, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        projectId, folder_path, file_name, is_folder, file_type,
        content, storage_type, storage_url, file_size_bytes,
        metadata, sort_order
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating research item:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Item with this name already exists in this folder' });
    } else {
      res.status(500).json({ error: 'Failed to create research item' });
    }
  }
});

// Update a research item
// PATCH /api/research/:projectId/item/:itemId
router.patch('/:projectId/item/:itemId', authenticateToken, async (req, res) => {
  const { projectId, itemId } = req.params;
  const updates = req.body;

  try {
    // Verify user owns this item
    const ownerCheck = await db.query(
      `SELECT r.id FROM research_library r
       JOIN projects p ON r.project_id = p.project_id
       WHERE r.id = $1 AND r.project_id = $2 AND p.user_id = $3`,
      [itemId, projectId, req.user.user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Research item not found' });
    }

    // Build dynamic update query
    const allowedFields = [
      'file_name', 'content', 'storage_url', 'file_size_bytes',
      'metadata', 'sort_order'
    ];

    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(itemId);
    const query = `
      UPDATE research_library
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating research item:', error);
    res.status(500).json({ error: 'Failed to update research item' });
  }
});

// Move a research item to a different folder
// POST /api/research/:projectId/item/:itemId/move
router.post('/:projectId/item/:itemId/move', authenticateToken, async (req, res) => {
  const { projectId, itemId } = req.params;
  const { newFolderPath } = req.body;

  try {
    // Verify user owns this item
    const ownerCheck = await db.query(
      `SELECT r.id FROM research_library r
       JOIN projects p ON r.project_id = p.project_id
       WHERE r.id = $1 AND r.project_id = $2 AND p.user_id = $3`,
      [itemId, projectId, req.user.user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Research item not found' });
    }

    // Validate depth limit
    const depth = calculateDepth(newFolderPath);
    if (depth > 4) {
      return res.status(400).json({ error: 'Maximum folder depth (4) exceeded' });
    }

    // Move the item
    const result = await db.query(
      `UPDATE research_library
       SET folder_path = $1
       WHERE id = $2
       RETURNING *`,
      [newFolderPath, itemId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error moving research item:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Item with this name already exists in the target folder' });
    } else {
      res.status(500).json({ error: 'Failed to move research item' });
    }
  }
});

// Delete a research item
// DELETE /api/research/:projectId/item/:itemId
router.delete('/:projectId/item/:itemId', authenticateToken, async (req, res) => {
  const { projectId, itemId } = req.params;

  try {
    // Verify user owns this item
    const ownerCheck = await db.query(
      `SELECT r.id, r.is_folder, r.folder_path, r.file_name FROM research_library r
       JOIN projects p ON r.project_id = p.project_id
       WHERE r.id = $1 AND r.project_id = $2 AND p.user_id = $3`,
      [itemId, projectId, req.user.user_id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Research item not found' });
    }

    const item = ownerCheck.rows[0];

    // If deleting a folder, delete all items inside it
    if (item.is_folder) {
      const folderFullPath = item.folder_path + item.file_name + '/';
      await db.query(
        `DELETE FROM research_library
         WHERE project_id = $1 AND folder_path LIKE $2`,
        [projectId, folderFullPath + '%']
      );
    }

    // Delete the item itself
    await db.query(
      'DELETE FROM research_library WHERE id = $1',
      [itemId]
    );

    res.json({ message: 'Research item deleted successfully' });
  } catch (error) {
    console.error('Error deleting research item:', error);
    res.status(500).json({ error: 'Failed to delete research item' });
  }
});

// Search research library
// GET /api/research/:projectId/search?q=query&type=note&folder=/Research/
router.get('/:projectId/search', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { q, type, folder } = req.query;

  try {
    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build search query
    let query = `
      SELECT *, ts_rank(to_tsvector('english', searchable_text), plainto_tsquery('english', $2)) AS rank
      FROM research_library
      WHERE project_id = $1
    `;
    const params = [projectId, q || ''];
    let paramIndex = 3;

    if (q) {
      query += ` AND to_tsvector('english', searchable_text) @@ plainto_tsquery('english', $2)`;
    }

    if (type) {
      query += ` AND file_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (folder) {
      query += ` AND folder_path = $${paramIndex}`;
      params.push(folder);
      paramIndex++;
    }

    query += ` ORDER BY rank DESC, updated_at DESC LIMIT 50`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching research:', error);
    res.status(500).json({ error: 'Failed to search research' });
  }
});

// Get folder structure
// GET /api/research/:projectId/folders
router.get('/:projectId/folders', authenticateToken, async (req, res) => {
  const { projectId } = req.params;

  try {
    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all folders
    const result = await db.query(
      `SELECT id, folder_path, file_name, depth_level, created_at
       FROM research_library
       WHERE project_id = $1 AND is_folder = true
       ORDER BY folder_path ASC, file_name ASC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Process image URL and generate thumbnail
// POST /api/research/:projectId/process-image-url
router.post('/:projectId/process-image-url', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { imageUrl, folderPath = '/', fileName } = req.body;

  try {
    // Verify user owns this project
    const projectCheck = await db.query(
      'SELECT user_id FROM projects WHERE project_id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (projectCheck.rows[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate image URL
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'Valid image URL required' });
    }

    // Process image URL
    const result = await imageService.processImageUrl(imageUrl);

    // Create research item with thumbnail
    const baseFileName = fileName || extractFileNameFromUrl(imageUrl);

    // Ensure filename is unique in this folder
    const itemFileName = await ensureUniqueFileName(projectId, folderPath, baseFileName);

    const insertResult = await db.query(
      `INSERT INTO research_library (
        project_id, folder_path, file_name, is_folder, file_type,
        storage_type, storage_url, file_size_bytes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        projectId,
        folderPath,
        itemFileName,
        false,
        'image',
        'local_link',
        imageUrl,
        result.metadata.originalSize,
        {
          ...result.metadata,
          thumbnail: result.thumbnail,
          source: 'url'
        }
      ]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Error processing image URL:', error);
    res.status(500).json({ error: error.message || 'Failed to process image' });
  }
});

// Helper function to extract filename from URL
function extractFileNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let filename = pathname.substring(pathname.lastIndexOf('/') + 1);

    // Remove query parameters from filename
    filename = filename.split('?')[0];

    // If no filename or it's too generic, use a more descriptive default
    if (!filename || filename === '' || filename === 'image' || filename.length < 3) {
      const timestamp = Date.now();
      filename = `image_${timestamp}.jpg`;
    }

    return filename;
  } catch {
    const timestamp = Date.now();
    return `image_${timestamp}.jpg`;
  }
}

// Helper function to ensure unique filename
async function ensureUniqueFileName(projectId, folderPath, baseFileName) {
  const nameParts = baseFileName.split('.');
  const extension = nameParts.length > 1 ? nameParts.pop() : '';
  const baseName = nameParts.join('.');

  let fileName = baseFileName;
  let counter = 1;

  // Check if filename exists
  while (true) {
    const existing = await db.query(
      'SELECT id FROM research_library WHERE project_id = $1 AND folder_path = $2 AND file_name = $3',
      [projectId, folderPath, fileName]
    );

    if (existing.rows.length === 0) {
      return fileName;
    }

    // Add counter to filename
    fileName = extension
      ? `${baseName}_${counter}.${extension}`
      : `${baseName}_${counter}`;
    counter++;
  }
}

module.exports = router;
