// middleware/auth.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    // This is the critical line: It correctly accesses the nested "user" object from your token's payload.
    // It then assigns this object to req.user for all downstream routes.
    req.user = decoded.user; 
    
    if (!req.user) {
      return res.status(401).json({ error: 'Token payload is invalid.' });
    }

    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
}

module.exports = {
  authenticateToken
};