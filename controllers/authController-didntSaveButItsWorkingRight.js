// src/controllers/authController.js

// In controllers/authController.js

const bcrypt = require('bcryptjs');
const db = require('../db');
const tokenService = require('../services/tokenService');

// The new, corrected login function
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find the user by email
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    // 2. Compare the provided password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // --- ADD THIS LOG ------------------------------------------------------------
    const responsePayload = { accessToken, refreshToken };
    console.log('--- BACKEND LOGIN HANDOFF ---');
    console.log('Sending payload to frontend:', responsePayload);
    // -----------------------------------------------------------------------------

    // 3. Generate both tokens using your tokenService
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user);

    // 4. Send both tokens back in the response
    res.json({ accessToken, refreshToken });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// 2. CREATE THE REFRESH FUNCTION
// REPLACE your existing 'refresh' function with this one:
exports.refresh = async (req, res) => {
  console.log('--- Inside /auth/refresh controller ---');
  try {
    const { refreshToken } = req.body;
    console.log('1. Received refresh token:', refreshToken);

    if (!refreshToken) {
      console.log('Error: No refresh token provided.');
      return res.sendStatus(401);
    }

    const { rows } = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );
    const storedToken = rows[0];
    console.log('2. Found token in DB:', storedToken);

    if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
      console.log('Error: Token not found in DB or has expired.');
      return res.sendStatus(403);
    }

    console.log('3. Looking for user with user_id:', storedToken.user_id);
    const userResult = await db.query('SELECT * FROM users WHERE user_id = $1', [storedToken.user_id]);
    const user = userResult.rows[0];
    console.log('4. Found user:', user);

    if (!user) {
      console.log('Error: User for token not found.');
      return res.sendStatus(403);
    }

    const newAccessToken = tokenService.generateAccessToken(user);
    console.log('5. Generated new access token successfully.');

    res.json({ accessToken: newAccessToken });

  } catch (error) {
    // This is the most important part - it will print the actual crash error
    console.error('!!! CRASH IN REFRESH FUNCTION:', error);
    res.status(500).json({ message: 'Server error during token refresh' });
  }
};

// 3. CREATE THE LOGOUT FUNCTION
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    // Delete the refresh token from the database
    await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    res.sendStatus(204); // No Content
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};