// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // <-- THIS LINE IS THE FIX
const tokenService = require('../services/tokenService');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find the user in the database
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    // 2. Compare the password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Generate BOTH tokens using the token service
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user);

    // 4. Send both tokens back to the frontend
    res.json({ accessToken, refreshToken });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Add these two new routes
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);


// @route   POST api/auth/register
// @desc    Register a user
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING user_id',
      [email, passwordHash]
    );
    const payload = { user: { user_id: newUser.rows[0].user_id } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token

module.exports = router;