const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');


// Get the current logged-in user's details
// GET /api/users/me

router.get('/me', auth, async (req, res) => {
  try {
    const user = await db.query(
      "SELECT user_id, email, subscription_status FROM users WHERE user_id = $1",
      [req.user.id]
    );

    // FIXED: Add a check to ensure a user was found
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(user.rows[0]);
  } catch (err) {
    console.error(err.message); // It's helpful to log the specific error
    res.status(500).send('Server Error');
  }
});

// POST /api/users/start-trial
// Sets the current user's subscription_status to 'trial'
router.post('/start-trial', auth, async (req, res) => {
  try {
    await db.query(
      "UPDATE users SET subscription_status = 'trial' WHERE user_id = $1",
      [req.user.id]
    );
    res.json({ msg: 'Trial started successfully.' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// MOVED: This must be the last line in the file.
module.exports = router;