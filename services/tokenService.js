// services/tokenService.js
const jwt = require('jsonwebtoken');
const db = require('../db');

// This function creates the short-lived access token with a nested payload
function generateAccessToken(user) {
  const payload = {
    user: {
      user_id: user.user_id,
      email: user.email,
      username: user.username,
      role: user.role || 'user' // Include role in JWT token
    }
  };
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' }); // Extended to 1 day to handle clock drift
}

// This function creates and stores the long-lived refresh token
async function generateRefreshToken(user) {
  // Switched from require() to a dynamic import() for ESM compatibility
  const { v4: uuidv4 } = await import('uuid');
  const token = uuidv4();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7); // 7-day expiry

  try {
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.user_id]);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.user_id, token, expiryDate]
    );
    return token;
  } catch (err) {
    console.error("Error saving refresh token:", err);
    throw new Error("Could not generate refresh token.");
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
};