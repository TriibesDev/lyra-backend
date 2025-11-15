// routes/users.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Import the auth middleware
const db = require('../db');

// @route   GET api/users/me
// @desc    Get current user's data
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    // req.user.user_id is attached by the auth middleware from the JWT
    const userResult = await db.query(
      // FIXED: Changed "WHERE id = $1" to "WHERE user_id = $1"
      'SELECT user_id, email, subscription_status, created_at FROM users WHERE user_id = $1',
      // FIXED: Changed req.user_id to the correct req.user.user_id
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

module.exports = router;