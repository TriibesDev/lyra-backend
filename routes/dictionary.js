// routes/dictionary.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db'); // Your database connection

// Get user's custom dictionary
router.get('/users/dictionary', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT custom_dictionary FROM users WHERE user_id = $1',
      [req.user.userId || req.user.user_id]
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

// Update entire dictionary
router.put('/users/dictionary', authenticateToken, async (req, res) => {
  try {
    const { words } = req.body;
    
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: 'Words must be an array' });
    }
    
    await db.query(
      'UPDATE users SET custom_dictionary = $1 WHERE user_id = $2',
      [JSON.stringify(words), req.user.userId || req.user.user_id]
    );
    
    res.json({ success: true, words });
  } catch (error) {
    console.error('Error updating dictionary:', error);
    res.status(500).json({ error: 'Failed to update dictionary' });
  }
});

// Add single word to dictionary
router.post('/users/dictionary/add', authenticateToken, async (req, res) => {
  try {
    const { word } = req.body;
    
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Valid word required' });
    }
    
    const cleanWord = word.trim().toLowerCase();
    
    console.log('Adding word:', cleanWord, 'for user:', req.user.userId || req.user.user_id);
    
    // Try both possible user ID field names
    const userId = req.user.userId || req.user.user_id;
    
    const result = await db.query(
      `UPDATE users 
       SET custom_dictionary = 
         CASE 
           WHEN custom_dictionary @> $1::jsonb THEN custom_dictionary
           ELSE custom_dictionary || $1::jsonb
         END
       WHERE user_id = $2
       RETURNING custom_dictionary`,
      [JSON.stringify([cleanWord]), userId]
    );
    
    console.log('Query result rows:', result.rows.length);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, words: result.rows[0].custom_dictionary });
  } catch (error) {
    console.error('Error adding word:', error);
    res.status(500).json({ error: 'Failed to add word' });
  }
});

// Remove word from dictionary
router.delete('/users/dictionary/remove', authenticateToken, async (req, res) => {
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
        [cleanWord, req.user.userId || req.user.user_id]
      );
      
    res.json({ success: true, words: result.rows[0].custom_dictionary || [] });
  } catch (error) {
    console.error('Error removing word:', error);
    res.status(500).json({ error: 'Failed to remove word' });
  }
});

module.exports = router;