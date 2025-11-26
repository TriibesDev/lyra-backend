// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const authController = require('../controllers/authController');
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticateToken } = require('../middleware/auth'); 

// @route   POST api/auth/login
// @desc    Authenticate user & get tokens
router.post('/login', authController.login);

// @route   POST api/auth/register-trial
// @desc    Register user with free trial
router.post('/register-trial', async (req, res) => {
  const { username, email, password, marketingOptIn } = req.body;
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.user_id; // Get user ID from the auth middleware

  try {
    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Check if username is taken
    const existingUsername = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create user with trial status and tier
    const newUser = await db.query(
      `INSERT INTO users (username, email, password_hash, subscription_status, subscription_tier, trial_started_at, marketing_opt_in, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW()) RETURNING *`,
      [username, email, passwordHash, 'trial', 'trial', marketingOptIn || false]
    );
    
    const user = newUser.rows[0];
    
    // Generate tokens
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user);
    
    res.status(201).json({ 
      accessToken, 
      refreshToken,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        subscription_status: user.subscription_status
      }
    });
    
  } catch (err) {
    console.error('Trial registration error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST api/auth/register-with-subscription
// @desc    Register user and create paid subscription
router.post('/register-with-subscription', async (req, res) => {
  const {
    username, email, password, firstName, lastName,
    address, city, state, zipCode, marketingOptIn,
    paymentMethodId, stripePriceId, tierSlug
  } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Check if username is taken
    const existingUsername = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Validate required fields
    if (!stripePriceId) {
      return res.status(400).json({ error: 'Stripe Price ID is required' });
    }

    if (!tierSlug) {
      return res.status(400).json({ error: 'Tier slug is required' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create Stripe customer
    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
      email: email,
      name: `${firstName} ${lastName}`,
      address: {
        line1: address,
        city: city,
        state: state,
        postal_code: zipCode,
        country: 'US'
      },
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Create subscription with the exact Stripe Price ID from frontend
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: stripePriceId }],
      expand: ['latest_invoice.payment_intent'],
    });

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(400).json({ error: 'Payment failed' });
    }
    
    // Create user in database with tier information
    const newUser = await db.query(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name,
        address, city, state, zip_code, subscription_status, subscription_tier,
        stripe_customer_id, stripe_subscription_id, stripe_price_id, marketing_opt_in, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()) RETURNING *`,
      [
        username, email, passwordHash, firstName, lastName,
        address, city, state, zipCode, 'active', tierSlug.toLowerCase(),
        customer.id, subscription.id, stripePriceId, marketingOptIn || false
      ]
    );
    
    const user = newUser.rows[0];
    
    // Generate tokens
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user);
    
    res.status(201).json({ 
      accessToken, 
      refreshToken,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        subscription_status: user.subscription_status
      },
      subscription: {
        id: subscription.id,
        status: subscription.status
      }
    });
    
  } catch (err) {
    console.error('Paid registration error:', err.message);
    
    // If it's a Stripe error, provide more specific feedback
    if (err.type === 'StripeCardError') {
      return res.status(400).json({ error: 'Payment failed: ' + err.message });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST api/auth/register
// @desc    Register a user (basic registration)
router.post('/register', async (req, res) => {
  const { email, password, username } = req.body;

  try {
    // Check if user already exists by email
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Check if username is taken (if username provided)
    if (username) {
      const existingUsername = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      if (existingUsername.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user with default subscription status
    const newUser = await db.query(
      'INSERT INTO users (email, username, password_hash, subscription_status) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, username || null, passwordHash, 'inactive']
    );

    const user = newUser.rows[0];

    // Generate tokens (consistent with login)
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.generateRefreshToken(user);

    res.status(201).json({ accessToken, refreshToken });

  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST api/auth/refresh
// @desc    Refresh access token using refresh token
router.post('/refresh', authController.refresh);

// @route   POST api/auth/logout
// @desc    Logout user and revoke refresh token  
router.post('/logout', authController.logout);

router.patch('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  // Your middleware correctly puts the user payload in req.user
  // We assume the payload contains user_id, just like on login
  const userId = req.user.user_id; 

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Please provide a valid current password and a new password of at least 8 characters.' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await db.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newPasswordHash, userId]);

    res.status(200).json({ message: 'Password updated successfully.' });

  } catch (err) {
    console.error('Password change error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});
router.delete('/me', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  try {
    // In a full application, you would also delete related data:
    // projects, stripe subscriptions, etc.
    console.log(`Deleting user account for user_id: ${userId}`);
    await db.query('DELETE FROM users WHERE user_id = $1', [userId]);

    // It's also good practice to invalidate any refresh tokens here

    res.status(200).json({ message: 'Account deleted successfully.' });

  } catch (err) {
    console.error('Account deletion error:', err.message);
    res.status(500).json({ error: 'Server error during account deletion.' });
  }
});

// @route   POST api/auth/forgot-password
// @desc    Request password reset - sends email with reset link
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Always return success to prevent email enumeration attacks
  const successResponse = {
    message: 'If an account with that email exists, a password reset link has been sent.'
  };

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const userResult = await db.query(
      'SELECT user_id, email, username FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (userResult.rows.length === 0) {
      // User doesn't exist, but return success to prevent email enumeration
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.status(200).json(successResponse);
    }

    const user = userResult.rows[0];

    // Rate limiting: Check for recent reset requests (max 3 per hour)
    const recentTokensResult = await db.query(
      `SELECT COUNT(*) FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [user.user_id]
    );

    if (parseInt(recentTokensResult.rows[0].count) >= 3) {
      console.log(`Rate limit exceeded for password reset: ${email}`);
      return res.status(429).json({
        error: 'Too many password reset requests. Please try again later.'
      });
    }

    // Generate secure random token (64 hex characters = 32 bytes)
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Invalidate any existing unused tokens for this user
    await db.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.user_id]
    );

    // Store the new token
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [user.user_id, resetToken, expiresAt]
    );

    // Send password reset email
    await emailService.sendPasswordResetEmail({
      email: user.email,
      username: user.username,
      resetToken: resetToken
    });

    console.log(`Password reset email sent to: ${email}`);
    res.status(200).json(successResponse);

  } catch (err) {
    console.error('Forgot password error:', err.message);
    // Still return success to prevent information leakage
    res.status(200).json(successResponse);
  }
});

// @route   POST api/auth/validate-reset-token
// @desc    Validate a password reset token
router.post('/validate-reset-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Reset token is required' });
  }

  try {
    // Find valid, unused token that hasn't expired
    const tokenResult = await db.query(
      `SELECT prt.*, u.email, u.username
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.user_id
       WHERE prt.token = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired reset link. Please request a new password reset.',
        code: 'INVALID_TOKEN'
      });
    }

    const tokenData = tokenResult.rows[0];

    res.status(200).json({
      valid: true,
      email: tokenData.email
    });

  } catch (err) {
    console.error('Validate reset token error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST api/auth/reset-password
// @desc    Reset password using valid token
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Reset token is required' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters long'
    });
  }

  // Validate password requirements
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({
      error: 'Password must contain at least one uppercase letter'
    });
  }

  if (!/[0-9]/.test(password)) {
    return res.status(400).json({
      error: 'Password must contain at least one number'
    });
  }

  try {
    // Find valid, unused token that hasn't expired
    const tokenResult = await db.query(
      `SELECT prt.*, u.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.user_id
       WHERE prt.token = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired reset link. Please request a new password reset.',
        code: 'INVALID_TOKEN'
      });
    }

    const tokenData = tokenResult.rows[0];

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Update the user's password
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2',
      [passwordHash, tokenData.user_id]
    );

    // Mark token as used
    await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [tokenData.id]
    );

    // Invalidate all refresh tokens for this user (force re-login everywhere)
    await db.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [tokenData.user_id]
    );

    console.log(`Password reset successful for user: ${tokenData.email}`);

    res.status(200).json({
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });

  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;