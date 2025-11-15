const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'emrys_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'scribe_db',
  password: process.env.DB_PASSWORD || 'thrushwoodlane',
  port: process.env.DB_PORT || 5432,
});

async function checkResearch() {
  try {
    const result = await pool.query(
      `SELECT id, folder_path, file_name, is_folder, file_type, created_at
       FROM research_library
       ORDER BY folder_path, file_name`
    );

    console.log('\n=== Research Library Items ===\n');
    console.log(`Total items: ${result.rows.length}\n`);

    result.rows.forEach(row => {
      const type = row.is_folder ? 'FOLDER' : row.file_type.toUpperCase();
      console.log(`${type.padEnd(8)} | ${row.folder_path.padEnd(30)} | ${row.file_name}`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkResearch();
