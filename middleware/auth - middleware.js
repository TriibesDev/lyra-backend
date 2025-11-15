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
    const decodedPayload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    // Attach the entire decoded user payload directly to req.user
    req.user = decodedPayload; 
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
}

module.exports = {
  authenticateToken
};