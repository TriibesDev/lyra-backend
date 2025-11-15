// middleware/validation.js
const { body, validationResult } = require('express-validator');
const db = require('../db');

// ... (registrationRules function remains unchanged) ...
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


const profileUpdateRules = () => {
  return [
    // FIX: Make username validation optional. It will only run if 'username' is in the request body.
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.')
      .custom(async (username, { req }) => {
        if (req.user && req.body.originalUsername === username) {
          return true;
        }
        const { rows } = await db.query('SELECT user_id FROM users WHERE username = $1', [username]);
        if (rows.length > 0) {
          return Promise.reject('Username already in use.');
        }
      }),

    // FIX: Make email validation optional. It will only run if 'email' is in the request body.
    body('email')
      .optional()
      .isEmail().withMessage('Please include a valid email.')
      .normalizeEmail()
      .custom(async (email, { req }) => {
        if (req.user && req.body.originalEmail === email) {
          return true;
        }
        const { rows } = await db.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (rows.length > 0) {
          return Promise.reject('Email already in use.');
        }
      }),

    // This rule for other text fields is already correct.
    body(['first_name', 'last_name', 'city', 'state', 'country', 'bio'])
      .optional({ checkFalsy: true })
      .trim()
      .escape(),

    // NEW: Add a validation rule for our new boolean field.
    body('login_to_last_project')
      .optional()
      .isBoolean().withMessage('Login preference must be a boolean value.')
  ];
};

// ... (validate function remains unchanged) ...
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
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