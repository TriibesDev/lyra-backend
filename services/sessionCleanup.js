// services/sessionCleanup.js
// Background task to clean up stale project sessions

const db = require('../db');

/**
 * Clean up sessions that haven't sent a heartbeat in over 2 minutes
 */
async function cleanupStaleSessions() {
  try {
    const result = await db.query(
      `DELETE FROM project_sessions
       WHERE last_heartbeat < NOW() - INTERVAL '2 minutes'`
    );

    if (result.rowCount > 0) {
      console.log(`[SessionCleanup] Removed ${result.rowCount} stale session(s)`);
    }
  } catch (error) {
    console.error('[SessionCleanup] Error cleaning up sessions:', error.message);
  }
}

/**
 * Start the cleanup interval (runs every minute)
 */
function startSessionCleanup() {
  console.log('[SessionCleanup] Starting cleanup service (runs every minute)');

  // Run immediately on start
  cleanupStaleSessions();

  // Then run every minute
  setInterval(cleanupStaleSessions, 60 * 1000);
}

module.exports = { startSessionCleanup, cleanupStaleSessions };
