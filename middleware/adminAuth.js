// middleware/adminAuth.js
// Middleware to verify user has admin role

/**
 * Middleware to check if the authenticated user has admin privileges
 * Must be used AFTER authenticateToken middleware
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userRole = req.user.role || 'user';

  if (userRole !== 'admin' && userRole !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Middleware to check if the authenticated user has superadmin privileges
 * Must be used AFTER authenticateToken middleware
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }

  next();
}

module.exports = {
  requireAdmin,
  requireSuperAdmin
};
