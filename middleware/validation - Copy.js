// middleware/validation.js
const { body, validationResult } = require('express-validator');
const db = require('../db'); // Ensure this path is correct for your project structure

// --- RULE SET 1: For New User Registration (Strict) ---
const registrationRules = () => {
  return [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required.')
      .isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.')
      .custom(async (username) => {
        const { rows } = await db.query('SELECT user_id FROM users WHERE username = $1', [username]);
        if (rows.length > 0) {
          return Promise.reject('Username already in use.');
        }
      }),
    body('email')
      .isEmail().withMessage('Please include a valid email.')
      .normalizeEmail()
      .custom(async (email) => {
        const { rows } = await db.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (rows.length > 0) {
          return Promise.reject('Email already in use.');
        }
      }),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
  ];
};


// --- RULE SET 2: For Profile Updates (Flexible) ---
const profileUpdateRules = () => {
  return [
    // Username is optional, but if provided, it must be valid and unique
    body('username')
      .trim()
      .if(body('username').notEmpty()) // Only run validations if username is not an empty string
      .isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.')
      .custom(async (username, { req }) => {
        // Skip uniqueness check if the username is the user's current one
        if (req.user && req.body.originalUsername === username) {
          return true;
        }
        const { rows } = await db.query('SELECT user_id FROM users WHERE username = $1', [username]);
        if (rows.length > 0) {
          return Promise.reject('Username already in use.');
        }
      }),
    
    // Email must be valid and unique (if changed)
    body('email')
      .isEmail().withMessage('Please include a valid email.')
      .normalizeEmail()
      .custom(async (email, { req }) => {
        // Skip uniqueness check if the email is the user's current one
        if (req.user && req.body.originalEmail === email) {
          return true;
        }
        const { rows } = await db.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (rows.length > 0) {
          return Promise.reject('Email already in use.');
        }
      }),

    // Validation for new optional fields
    body(['first_name', 'last_name', 'city', 'state', 'country', 'bio'])
      .optional({ checkFalsy: true }) // Allows fields to be empty strings or null
      .trim()     // Trim whitespace
      .escape(),  // Sanitize to prevent XSS attacks
  ];
};


// --- Validator Error Handler ---
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  // Format errors to be field-specific for the frontend
  const extractedErrors = {};
  errors.array().forEach(err => {
    if (!extractedErrors[err.param]) {
      extractedErrors[err.param] = err.msg;
    }
  });

  return res.status(400).json({ errors: extractedErrors });
};


module.exports = {
  registrationRules,
  profileUpdateRules,
  validate,
};