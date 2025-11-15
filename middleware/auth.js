// middleware/auth.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded.user;
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Token payload is invalid.' });
    }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
}

function requireAdmin(req, res, next) {
  // Check if user exists and has admin or superadmin role
  if (!req.user || !req.user.role || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin
};