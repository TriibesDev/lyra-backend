// routes/users.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const { profileUpdateRules, validate } = require('../middleware/validation');

// @route   GET api/users/me
// @desc    Get current user's data
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  try {
    const result = await db.query(
      `SELECT
         user_id, username, email, bio, first_name, last_name, city, state, country,
         subscription_status, role, login_to_last_project, last_project_id, last_view
       FROM users WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get /me route error:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PATCH api/users/me
// @desc    Update the authenticated user's profile
// @access  Private
// In routes/users.js

// @route   PATCH api/users/me
// @desc    Update the authenticated user's profile (handles partial updates)
// @access  Private
router.patch('/me',
  authenticateToken,
  profileUpdateRules(),
  validate,
  async (req, res) => {
    const userId = req.user.user_id;
    const fieldsToUpdate = req.body;

    // Define which fields are allowed to be updated through this endpoint
    const allowedFields = [
      'username', 'email', 'bio', 'first_name', 'last_name',
      'city', 'state', 'country', 'login_to_last_project'
    ];

    const queryParts = [];
    const queryValues = [];
    let queryIndex = 1;

    // Build the query dynamically
    for (const field of allowedFields) {
      if (fieldsToUpdate[field] !== undefined) {
        queryParts.push(`${field} = $${queryIndex}`);
        queryValues.push(fieldsToUpdate[field]);
        queryIndex++;
      }
    }

    // If no valid fields were sent, return an error
    if (queryParts.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    // Add the user ID for the WHERE clause
    queryValues.push(userId);

    const queryString = `
      UPDATE users SET ${queryParts.join(', ')}
      WHERE user_id = $${queryIndex}
      RETURNING user_id, username, email, bio, first_name, last_name, city, state, country, subscription_status, login_to_last_project
    `;

    try {
      const result = await db.query(queryString, queryValues);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('User update error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.patch('/me/last-location', authenticateToken, async (req, res) => {
  const { projectId, view } = req.body;
  const userId = req.user.user_id;

  // Basic validation
  if (!projectId || !view) {
    return res.status(400).json({ error: 'Project ID and view are required.' });
  }

  try {
    await db.query(
      'UPDATE users SET last_project_id = $1, last_view = $2 WHERE user_id = $3',
      [projectId, view, userId]
    );

    res.status(200).json({ message: 'Last location updated successfully.' });

  } catch (err) {
    console.error('Error updating last location:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST api/users/start-trial
// @desc    Start free trial for user
// @access  Private
router.post('/start-trial', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE users SET subscription_status = $1, trial_started_at = NOW() WHERE user_id = $2 RETURNING *',
      ['trial', req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: 'Trial started successfully',
      user: {
        user_id: result.rows[0].user_id,
        email: result.rows[0].email,
        subscription_status: result.rows[0].subscription_status
      }
    });
  } catch (err) {
    console.error('Start trial error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Dictionary Routes ---

// @route   GET api/users/dictionary
router.get('/dictionary', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT custom_dictionary FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ words: result.rows[0].custom_dictionary || [] });
  } catch (error) {
    console.error('Error fetching dictionary:', error);
    res.status(500).json({ error: 'Failed to fetch dictionary' });
  }
});

// @route   PUT api/users/dictionary
router.put('/dictionary', authenticateToken, async (req, res) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: 'Words must be an array' });
    }
    const result = await db.query(
      'UPDATE users SET custom_dictionary = $1::jsonb WHERE user_id = $2 RETURNING custom_dictionary',
      [JSON.stringify(words), req.user.user_id]
    );
    res.json({ success: true, words: result.rows[0].custom_dictionary });
  } catch (error) {
    console.error('Error updating dictionary:', error);
    res.status(500).json({ error: 'Failed to update dictionary' });
  }
});

// @route   POST api/users/dictionary/add
router.post('/dictionary/add', authenticateToken, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Valid word required' });
    }
    const cleanWord = word.trim().toLowerCase();
    const result = await db.query(
      `UPDATE users
       SET custom_dictionary =
         CASE
           WHEN custom_dictionary IS NULL THEN $1::jsonb
           WHEN custom_dictionary @> $1::jsonb THEN custom_dictionary
           ELSE custom_dictionary || $1::jsonb
         END
       WHERE user_id = $2
       RETURNING custom_dictionary`,
      [JSON.stringify([cleanWord]), req.user.user_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, words: result.rows[0].custom_dictionary });
  } catch (error) {
    console.error('Error adding word:', error);
    res.status(500).json({ error: 'Failed to add word' });
  }
});

// @route   DELETE api/users/dictionary/remove
router.delete('/dictionary/remove', authenticateToken, async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Valid word required' });
    }
    const cleanWord = word.trim().toLowerCase();
    const result = await db.query(
      `UPDATE users
       SET custom_dictionary =
         CASE
           WHEN custom_dictionary IS NULL THEN '[]'::jsonb
           ELSE (
             SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
             FROM jsonb_array_elements_text(custom_dictionary) elem
             WHERE elem != $1
           )
         END
       WHERE user_id = $2
       RETURNING custom_dictionary`,
      [cleanWord, req.user.user_id]
    );
    res.json({ success: true, words: result.rows[0].custom_dictionary || [] });
  } catch (error) {
    console.error('Error removing word:', error);
    res.status(500).json({ error: 'Failed to remove word' });
  }
});

module.exports = router;