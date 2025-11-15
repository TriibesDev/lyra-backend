// test-db.js

// 1. Load environment variables from .env file
require('dotenv').config();

// 2. Import the Pool class from the pg library
const { Pool } = require('pg');

// 3. Create a new Pool. It will automatically use the PG... variables from .env
const pool = new Pool();

// 4. Define an async function to test the connection
async function testConnection() {
  console.log('Attempting to connect to the database...');
  let client;
  try {
    // Get a client from the pool. This is where the actual connection happens.
    client = await pool.connect();
    console.log('✅ Success! Connected to the database.');
  } catch (error) {
    // If the connection fails, the error will be caught and displayed here.
    console.error('❌ Error! Failed to connect to the database.');
    console.error(error.stack); // Print the full error details
  } finally {
    // 5. Always release the client and end the pool to allow the script to exit.
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('Connection test finished.');
  }
}

// 6. Run the test function
testConnection();