// routes/users.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

// @route   GET api/users/me
// @desc    Get current user's data
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT user_id, email, subscription_status, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
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
// @desc    Get user's custom dictionary
// @access  Private
router.get('/dictionary', authenticateToken, async (req, res) => {
  console.log('GET /dictionary - User:', req.user.user_id);
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
// @desc    Update entire dictionary
// @access  Private
router.put('/dictionary', authenticateToken, async (req, res) => {
  console.log('PUT /dictionary - User:', req.user.user_id);
  try {
    const { words } = req.body;
    
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: 'Words must be an array' });
    }
    
    const result = await db.query(
      'UPDATE users SET custom_dictionary = $1 WHERE user_id = $2 RETURNING custom_dictionary',
      [JSON.stringify(words), req.user.user_id]
    );
    
    res.json({ success: true, words: result.rows[0].custom_dictionary });
  } catch (error) {
    console.error('Error updating dictionary:', error);
    res.status(500).json({ error: 'Failed to update dictionary' });
  }
});

// @route   POST api/users/dictionary/add
// @desc    Add single word to dictionary
// @access  Private
router.post('/dictionary/add', authenticateToken, async (req, res) => {
  console.log('POST /dictionary/add - User:', req.user.user_id);
  try {
    const { word } = req.body;
    
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Valid word required' });
    }
    
    const cleanWord = word.trim().toLowerCase();
    console.log('Adding word:', cleanWord);
    
    const result = await db.query(
      `UPDATE users 
       SET custom_dictionary = 
         CASE 
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
    
    console.log('Word added. Total words:', result.rows[0].custom_dictionary.length);
    res.json({ success: true, words: result.rows[0].custom_dictionary });
  } catch (error) {
    console.error('Error adding word:', error);
    res.status(500).json({ error: 'Failed to add word' });
  }
});

// @route   DELETE api/users/dictionary/remove
// @desc    Remove word from dictionary
// @access  Private
router.delete('/dictionary/remove', authenticateToken, async (req, res) => {
  console.log('DELETE /dictionary/remove - User:', req.user.user_id);
  try {
    const { word } = req.body;
    
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Valid word required' });
    }
    
    const cleanWord = word.trim().toLowerCase();
    
    const result = await db.query(
      `UPDATE users 
       SET custom_dictionary = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
         FROM jsonb_array_elements_text(custom_dictionary) elem
         WHERE elem != $1
       )
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