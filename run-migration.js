// run-migration.js
// Simple script to run database migrations

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigration(filename) {
  try {
    const migrationPath = path.join(__dirname, 'migrations', filename);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Running migration: ${filename}`);
    await db.query(sql);
    console.log(`✓ Migration ${filename} completed successfully`);

    process.exit(0);
  } catch (error) {
    console.error(`✗ Migration failed:`, error.message);
    process.exit(1);
  }
}

// Get migration filename from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file>');
  console.error('Example: node run-migration.js 001_add_role_column.sql');
  process.exit(1);
}

runMigration(migrationFile);
