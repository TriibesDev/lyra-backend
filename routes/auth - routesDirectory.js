// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const authController = require('../controllers/authController');
const tokenService = require('../services/tokenService');
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
    
    // Create user with trial status
    const newUser = await db.query(
      `INSERT INTO users (username, email, password_hash, subscription_status, trial_started_at, marketing_opt_in, created_at) 
       VALUES ($1, $2, $3, $4, NOW(), $5, NOW()) RETURNING *`,
      [username, email, passwordHash, 'trial', marketingOptIn || false]
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
    paymentMethodId, planType 
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

    // Get the correct Stripe price ID based on plan type
    const priceIds = {
      monthly: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_1S98u7FAF9VAMihO8KBiVTIH',
      annual: process.env.STRIPE_ANNUAL_PRICE_ID || 'price_annual_id_here'
    };

    if (!priceIds[planType]) {
      return res.status(400).json({ error: 'Invalid plan type' });
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

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceIds[planType] }],
      expand: ['latest_invoice.payment_intent'],
    });

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(400).json({ error: 'Payment failed' });
    }
    
    // Create user in database
    const newUser = await db.query(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name,
        address, city, state, zip_code, subscription_status,
        stripe_customer_id, stripe_subscription_id, marketing_opt_in, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) RETURNING *`,
      [
        username, email, passwordHash, firstName, lastName,
        address, city, state, zipCode, 'active',
        customer.id, subscription.id, marketingOptIn || false
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
  const { email, password } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create user with default subscription status
    const newUser = await db.query(
      'INSERT INTO users (email, password_hash, subscription_status) VALUES ($1, $2, $3) RETURNING *',
      [email, passwordHash, 'inactive']
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

module.exports = router;