const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db'); // Assuming this is the correct path to your DB config

const generateAccessToken = (user) => {
  // This payload now matches the original nested structure your middleware expects
  const payload = {
    user: {
      user_id: user.user_id
    }
  };
  
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRATION,
  });
};

const generateRefreshToken = async (user) => {
  const token = uuidv4(); // Generate a unique, random token
  const expiryDate = new Date();
  // Set expiration based on your .env, defaulting to 7 days
  const days = process.env.REFRESH_TOKEN_EXPIRATION?.endsWith('d') 
    ? parseInt(process.env.REFRESH_TOKEN_EXPIRATION) 
    : 7;
  expiryDate.setDate(expiryDate.getDate() + days);

  // Store the refresh token in the database
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.user_id, token, expiryDate]
  );
  return token;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
};