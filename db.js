// server/db.js

const { Pool } = require('pg');

// Support both DATABASE_URL (production/Render) and individual env vars (local development)
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false // Required for Render PostgreSQL
        }
      }
    : {
        // Local development using individual environment variables
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT || 5432,
      }
);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// We export a query function that we can use throughout our application
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // Export pool for advanced usage
};