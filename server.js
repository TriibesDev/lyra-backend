require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); 
const app = express();
const { authenticateToken } = require('./middleware/auth'); 

// --- CORRECT CORS CONFIGURATION ---
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173'];

console.log('📋 Allowed CORS origins:', allowedOrigins);

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS allowed for origin:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      console.log('📋 Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Explicit OPTIONS handling for all routes
app.options('*', cors(corsOptions));

// --- Middleware ---
// Increase body size limit to handle large Word document imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logger Middleware
app.use((req, res, next) => {
  console.log(`Received: ${req.method} request for '${req.url}'`);
  next();
});


// Use helmet middleware 
app.use( 
helmet.contentSecurityPolicy({ 
directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 
"script-src": ["'self'", "'unsafe-eval'"], }, }) ); 
// ... rest of your server setup (routes, static file serving, etc.) 


// --- Routes ---
app.get('/', (req, res) => {
  res.send('Hello from the secure server!');
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/chapters', require('./routes/chapters'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/readers', require('./routes/readers'));
app.use('/api/research', require('./routes/research'));

const relationshipRoutes = require('./routes/relationshipRoutes');
const relationshipController = require('./controllers/relationshipController');
app.get('/api/projects/:projectId/web-view', authenticateToken, relationshipController.getWebViewData);
// Mount the relationship routes under a project
app.use('/api/projects/:projectId/relationships', relationshipRoutes);

// You must define subscriptionRoutes before you can use it.
const subscriptionRoutes = require('./routes/subscriptions');
app.use('/api/subscriptions', subscriptionRoutes);
console.log('✅ Subscription routes successfully registered under /api/subscriptions');

// --- Coupon routes ---
const couponRoutes = require('./routes/coupons');
const adminCouponRoutes = require('./routes/admin/coupons');
app.use('/api/coupons', couponRoutes);
app.use('/api/admin/coupons', adminCouponRoutes);
console.log('✅ Coupon routes successfully registered under /api/coupons and /api/admin/coupons');

// --- Dictionary routes ---
try {
 
 } catch (error) {
  console.error('❌ Failed to load dictionary routes:', error.message);
}

// --- Server Startup ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);

  // Start session cleanup service
  const { startSessionCleanup } = require('./services/sessionCleanup');
  startSessionCleanup();
});