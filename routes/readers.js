// routes/readers.js
// Beta Reader Invitation and Feedback System
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const crypto = require('crypto');
const { sendReaderInvitation } = require('../services/emailService');

// Utility function to generate secure access token
function generateAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// SUBSCRIBER (AUTHOR) ENDPOINTS
// ============================================================================

// @route   POST /api/readers/invitations
// @desc    Create new reader invitation(s)
// @access  Private (authenticated user)
router.post('/invitations', authenticateToken, async (req, res) => {
  const {
    projectId,
    chapters, // Array of chapter IDs
    invitationMessage,
    readers, // Array of {name, email}
    expiresAt,
    circleName // Circle name
  } = req.body;

  try {
    // Verify project belongs to user
    const projectCheck = await db.query(
      'SELECT project_id FROM projects WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.user_id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    // Check reader limit (max 15 active invitations per project)
    const activeCount = await db.query(
      `SELECT COUNT(*) as count FROM reader_invitations
       WHERE project_id = $1 AND status IN ('pending', 'accepted') AND expires_at > NOW()`,
      [projectId]
    );

    const currentActive = parseInt(activeCount.rows[0].count);
    if (currentActive + readers.length > 15) {
      return res.status(400).json({
        error: `Maximum 15 active readers per project. Currently: ${currentActive}`
      });
    }

    // Get project details for email
    const projectDetails = await db.query(
      `SELECT p.title, p.project_data, u.first_name, u.last_name, u.username
       FROM projects p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.project_id = $1`,
      [projectId]
    );

    const project = projectDetails.rows[0];
    const authorName = project.first_name && project.last_name
      ? `${project.first_name} ${project.last_name}`
      : project.username;

    // Get chapter names
    const allChapters = project.project_data.chapters || [];
    const chapterNames = allChapters
      .filter(ch => chapters.includes(ch.id))
      .map(ch => ch.name || 'Untitled Chapter');

    // Create invitations and send emails
    const invitations = [];
    const emailErrors = [];

    for (const reader of readers) {
      const accessToken = generateAccessToken();

      try {
        // Create invitation in database
        const result = await db.query(
          `INSERT INTO reader_invitations
           (project_id, user_id, access_token, chapters_accessible, invitation_message,
            reader_name, reader_email, expires_at, circle_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, access_token, reader_name, reader_email, status, created_at, expires_at`,
          [
            projectId,
            req.user.user_id,
            accessToken,
            JSON.stringify(chapters),
            invitationMessage,
            reader.name,
            reader.email,
            expiresAt,
            circleName || `Draft Review - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          ]
        );

        const invitation = result.rows[0];
        invitations.push(invitation);

        // Send email invitation
        try {
          await sendReaderInvitation({
            readerEmail: reader.email,
            readerName: reader.name,
            projectTitle: project.title,
            authorName,
            accessToken,
            expiresAt,
            invitationMessage,
            chapterNames
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${reader.email}:`, emailError);
          emailErrors.push({
            reader: reader.email,
            error: emailError.message
          });
        }
      } catch (dbError) {
        console.error(`Failed to create invitation for ${reader.email}:`, dbError);
        throw dbError;
      }
    }

    // Return invitations with email status
    res.status(201).json({
      invitations,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
      message: emailErrors.length > 0
        ? `${invitations.length} invitation(s) created, but ${emailErrors.length} email(s) failed to send`
        : `${invitations.length} invitation(s) created and sent successfully`
    });
  } catch (err) {
    console.error('Error creating reader invitations:', err);
    res.status(500).json({ error: 'Failed to create invitations', details: err.message });
  }
});

// @route   GET /api/readers/invitations/:projectId
// @desc    Get all invitations for a project (or all projects if projectId is 'all')
// @access  Private
router.get('/invitations/:projectId', authenticateToken, async (req, res) => {
  const { projectId } = req.params;

  try {
    let query, params;

    if (projectId === 'all') {
      // Get all invitations across all user's projects
      query = `SELECT ri.id, ri.reader_name, ri.reader_email, ri.status, ri.accepted_at,
                      ri.expires_at, ri.created_at, ri.last_activity_at, ri.project_id,
                      ri.chapters_accessible, ri.invitation_message, ri.circle_name, ri.archived,
                      p.title as project_title,
                      (SELECT COUNT(*) FROM reader_markers WHERE invitation_id = ri.id) as marker_count
               FROM reader_invitations ri
               JOIN projects p ON p.project_id = ri.project_id
               WHERE p.user_id = $1
               ORDER BY ri.created_at DESC`;
      params = [req.user.user_id];
    } else {
      // Get invitations for specific project
      query = `SELECT ri.id, ri.reader_name, ri.reader_email, ri.status, ri.accepted_at,
                      ri.expires_at, ri.created_at, ri.last_activity_at, ri.project_id,
                      ri.chapters_accessible, ri.invitation_message, ri.circle_name, ri.archived,
                      p.title as project_title,
                      (SELECT COUNT(*) FROM reader_markers WHERE invitation_id = ri.id) as marker_count
               FROM reader_invitations ri
               JOIN projects p ON p.project_id = ri.project_id
               WHERE ri.project_id = $1 AND p.user_id = $2
               ORDER BY ri.created_at DESC`;
      params = [projectId, req.user.user_id];
    }

    const invitations = await db.query(query, params);

    res.json({ invitations: invitations.rows });
  } catch (err) {
    console.error('Error fetching invitations:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// @route   GET /api/readers/feedback/:projectId
// @desc    Get all reader feedback for a project
// @access  Private
router.get('/feedback/:projectId', authenticateToken, async (req, res) => {
  const { projectId } = req.params;

  try {
    // Get all readers who have provided feedback
    const readers = await db.query(
      `SELECT DISTINCT
         ri.id as invitation_id,
         ri.reader_name,
         ri.status,
         COUNT(rm.id) as marker_count,
         MAX(rm.created_at) as last_feedback_at
       FROM reader_invitations ri
       LEFT JOIN reader_markers rm ON rm.invitation_id = ri.id
       WHERE ri.project_id = $1 AND ri.user_id = $2
       GROUP BY ri.id, ri.reader_name, ri.status
       HAVING COUNT(rm.id) > 0
       ORDER BY last_feedback_at DESC`,
      [projectId, req.user.user_id]
    );

    res.json({ readers: readers.rows });
  } catch (err) {
    console.error('Error fetching reader feedback:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// @route   GET /api/readers/markers/:invitationId
// @desc    Get all markers from a specific reader
// @access  Private
router.get('/markers/:invitationId', authenticateToken, async (req, res) => {
  const { invitationId } = req.params;

  try {
    // Verify invitation belongs to user's project
    const invitationCheck = await db.query(
      `SELECT ri.id FROM reader_invitations ri
       JOIN projects p ON p.project_id = ri.project_id
       WHERE ri.id = $1 AND p.user_id = $2`,
      [invitationId, req.user.user_id]
    );

    if (invitationCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or unauthorized' });
    }

    const markers = await db.query(
      `SELECT rm.*, ri.reader_name
       FROM reader_markers rm
       JOIN reader_invitations ri ON ri.id = rm.invitation_id
       WHERE rm.invitation_id = $1
       ORDER BY rm.created_at ASC`,
      [invitationId]
    );

    res.json({ markers: markers.rows });
  } catch (err) {
    console.error('Error fetching reader markers:', err);
    res.status(500).json({ error: 'Failed to fetch markers' });
  }
});

// @route   POST /api/readers/markers/:markerId/import
// @desc    Import a reader marker into author's project
// @access  Private
router.post('/markers/:markerId/import', authenticateToken, async (req, res) => {
  const { markerId } = req.params;

  try {
    // Get marker and verify ownership
    const marker = await db.query(
      `SELECT rm.*, ri.reader_name, ri.project_id
       FROM reader_markers rm
       JOIN reader_invitations ri ON ri.id = rm.invitation_id
       JOIN projects p ON p.project_id = ri.project_id
       WHERE rm.id = $1 AND p.user_id = $2`,
      [markerId, req.user.user_id]
    );

    if (marker.rows.length === 0) {
      return res.status(404).json({ error: 'Marker not found or unauthorized' });
    }

    const markerData = marker.rows[0];

    // Mark as imported
    await db.query(
      'UPDATE reader_markers SET imported_to_project = true, imported_at = NOW() WHERE id = $1',
      [markerId]
    );

    // Return marker data for frontend to add to project_data
    res.json({
      marker: {
        id: markerData.marker_id,
        type: markerData.marker_type,
        text: `[${markerData.reader_name}]\n${markerData.marker_text}`,
        highlightedText: markerData.highlighted_text,
        positionData: markerData.position_data,
        chapterId: markerData.chapter_id,
        sceneId: markerData.scene_id,
        isReaderFeedback: true,
        readerName: markerData.reader_name,
        createdAt: markerData.created_at
      }
    });
  } catch (err) {
    console.error('Error importing marker:', err);
    res.status(500).json({ error: 'Failed to import marker' });
  }
});

// @route   POST /api/readers/invitations/:invitationId/resend
// @desc    Resend a reader invitation email
// @access  Private
router.post('/invitations/:invitationId/resend', authenticateToken, async (req, res) => {
  const { invitationId } = req.params;

  try {
    // Get invitation details
    const invitation = await db.query(
      `SELECT ri.*, p.title as project_title, p.project_data, u.first_name, u.last_name, u.username
       FROM reader_invitations ri
       JOIN projects p ON p.project_id = ri.project_id
       JOIN users u ON u.user_id = p.user_id
       WHERE ri.id = $1 AND ri.user_id = $2`,
      [invitationId, req.user.user_id]
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or unauthorized' });
    }

    const inv = invitation.rows[0];

    // Check if expired
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Cannot resend expired invitation. Please create a new one.' });
    }

    // Check if revoked
    if (inv.status === 'revoked') {
      return res.status(400).json({ error: 'Cannot resend revoked invitation' });
    }

    // Get author name
    const authorName = inv.first_name && inv.last_name
      ? `${inv.first_name} ${inv.last_name}`
      : inv.username;

    // Get chapter names
    const accessibleChapters = typeof inv.chapters_accessible === 'string'
      ? JSON.parse(inv.chapters_accessible)
      : inv.chapters_accessible;

    const allChapters = inv.project_data.chapters || [];
    const chapterNames = allChapters
      .filter(ch => accessibleChapters.includes(ch.id))
      .map(ch => ch.name || 'Untitled Chapter');

    // Send email
    try {
      await sendReaderInvitation({
        readerEmail: inv.reader_email,
        readerName: inv.reader_name,
        projectTitle: inv.project_title,
        authorName,
        accessToken: inv.access_token,
        expiresAt: inv.expires_at,
        invitationMessage: inv.invitation_message,
        chapterNames
      });

      res.json({ message: 'Invitation resent successfully' });
    } catch (emailError) {
      console.error('Error resending invitation:', emailError);
      res.status(500).json({
        error: 'Failed to send email',
        details: emailError.message
      });
    }
  } catch (err) {
    console.error('Error resending invitation:', err);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// @route   DELETE /api/readers/invitations/:invitationId
// @desc    Revoke a reader invitation
// @access  Private
router.delete('/invitations/:invitationId', authenticateToken, async (req, res) => {
  const { invitationId } = req.params;

  try {
    const result = await db.query(
      `UPDATE reader_invitations
       SET status = 'revoked'
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [invitationId, req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or unauthorized' });
    }

    res.json({ message: 'Invitation revoked successfully' });
  } catch (err) {
    console.error('Error revoking invitation:', err);
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

// @route   PATCH /api/readers/circles/:projectId/name
// @desc    Update circle name for invitations
// @access  Private
router.patch('/circles/:projectId/name', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { chaptersAccessible, circleName } = req.body;

  try {
    // Update all invitations in this circle (same project + chapters)
    const result = await db.query(
      `UPDATE reader_invitations ri
       SET circle_name = $1
       FROM projects p
       WHERE ri.project_id = $2
         AND ri.user_id = $3
         AND p.project_id = ri.project_id
         AND p.user_id = $3
         AND ri.chapters_accessible::jsonb = $4::jsonb
       RETURNING ri.id`,
      [circleName, projectId, req.user.user_id, JSON.stringify(chaptersAccessible)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found or unauthorized' });
    }

    res.json({ message: 'Circle name updated successfully', updated: result.rows.length });
  } catch (err) {
    console.error('Error updating circle name:', err);
    res.status(500).json({ error: 'Failed to update circle name' });
  }
});

// @route   PATCH /api/readers/circles/:projectId/archive
// @desc    Archive a reader circle
// @access  Private
router.patch('/circles/:projectId/archive', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { chaptersAccessible, archived } = req.body;

  try {
    const result = await db.query(
      `UPDATE reader_invitations ri
       SET archived = $1
       FROM projects p
       WHERE ri.project_id = $2
         AND ri.user_id = $3
         AND p.project_id = ri.project_id
         AND p.user_id = $3
         AND ri.chapters_accessible::jsonb = $4::jsonb
       RETURNING ri.id`,
      [archived, projectId, req.user.user_id, JSON.stringify(chaptersAccessible)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Circle not found or unauthorized' });
    }

    const action = archived ? 'archived' : 'restored';
    res.json({ message: `Circle ${action} successfully`, updated: result.rows.length });
  } catch (err) {
    console.error('Error archiving/restoring circle:', err);
    res.status(500).json({ error: 'Failed to archive/restore circle' });
  }
});

// @route   GET /api/readers/contacts
// @desc    Get reader contacts for acknowledgements
// @access  Private
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const contacts = await db.query(
      `SELECT * FROM reader_contacts
       WHERE user_id = $1
       ORDER BY last_feedback_date DESC`,
      [req.user.user_id]
    );

    res.json({ contacts: contacts.rows });
  } catch (err) {
    console.error('Error fetching reader contacts:', err);
    res.status(500).json({ error: 'Failed to fetch reader contacts' });
  }
});

// ============================================================================
// READER (GUEST) ENDPOINTS - No authentication required, use token
// ============================================================================

// @route   GET /api/readers/access/:token
// @desc    Verify access token and get reader session
// @access  Public
router.get('/access/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const invitation = await db.query(
      `SELECT ri.*, p.title as project_title, p.project_data
       FROM reader_invitations ri
       JOIN projects p ON p.project_id = ri.project_id
       WHERE ri.access_token = $1`,
      [token]
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const inv = invitation.rows[0];

    // Check expiration
    if (new Date(inv.expires_at) < new Date()) {
      await db.query(
        'UPDATE reader_invitations SET status = \'expired\' WHERE id = $1',
        [inv.id]
      );
      return res.status(403).json({ error: 'Access token has expired' });
    }

    // Check if revoked
    if (inv.status === 'revoked') {
      return res.status(403).json({ error: 'Access has been revoked' });
    }

    // Update to accepted if first access
    if (inv.status === 'pending') {
      await db.query(
        'UPDATE reader_invitations SET status = \'accepted\', accepted_at = NOW() WHERE id = $1',
        [inv.id]
      );
    }

    // Create or get session
    let session = await db.query(
      'SELECT * FROM reader_sessions WHERE invitation_id = $1',
      [inv.id]
    );

    if (session.rows.length === 0) {
      session = await db.query(
        'INSERT INTO reader_sessions (invitation_id) VALUES ($1) RETURNING *',
        [inv.id]
      );
    }

    // Filter project_data to only include accessible chapters
    const projectData = inv.project_data;
    // chapters_accessible might already be parsed by PostgreSQL
    const accessibleChapters = typeof inv.chapters_accessible === 'string'
      ? JSON.parse(inv.chapters_accessible)
      : inv.chapters_accessible;

    console.log('=== DEBUG READER ACCESS ===');
    console.log('1. Accessible chapter IDs:', accessibleChapters);
    console.log('2. Total chapters in project:', projectData.chapters?.length);
    console.log('3. Chapter IDs in project:', projectData.chapters?.map(ch => ch.id));

    // Filter chapters and add chapter numbers based on original index
    const filteredChapters = projectData.chapters
      ?.map((ch, index) => ({ ...ch, chapterNumber: index + 1 }))
      ?.filter(ch => accessibleChapters.includes(ch.id));

    console.log('4. Filtered chapters count:', filteredChapters?.length);
    console.log('5. Filtered chapter IDs:', filteredChapters?.map(ch => ch.id));

    if (filteredChapters && filteredChapters.length > 0) {
      filteredChapters.forEach((ch, idx) => {
        console.log(`   Chapter ${idx + 1}:`, {
          id: ch.id,
          name: ch.name,
          chapterNumber: ch.chapterNumber,
          scenesCount: ch.scenes?.length || 0,
          firstSceneHasNotes: ch.scenes?.[0]?.notes ? 'YES' : 'NO',
          firstSceneNotesPreview: ch.scenes?.[0]?.notes ? JSON.stringify(ch.scenes[0].notes).substring(0, 100) : 'N/A'
        });
      });
    }
    console.log('===========================');

    res.json({
      invitation: {
        id: inv.id,
        projectTitle: inv.project_title,
        readerName: inv.reader_name,
        message: inv.invitation_message,
        expiresAt: inv.expires_at,
        status: inv.status
      },
      content: {
        chapters: filteredChapters || []
      },
      session: session.rows[0]
    });
  } catch (err) {
    console.error('Error verifying access token:', err);
    res.status(500).json({ error: 'Failed to verify access' });
  }
});

// @route   POST /api/readers/markers
// @desc    Create a new reader marker
// @access  Public (token-based)
router.post('/markers', async (req, res) => {
  const {
    accessToken,
    chapterId,
    sceneId,
    markerId,
    markerType,
    markerText,
    highlightedText,
    positionData
  } = req.body;

  try {
    // Verify token and get invitation
    const invitation = await db.query(
      'SELECT id, project_id, status, expires_at FROM reader_invitations WHERE access_token = $1',
      [accessToken]
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const inv = invitation.rows[0];

    if (inv.status === 'revoked' || new Date(inv.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Access expired or revoked' });
    }

    // Create marker
    const marker = await db.query(
      `INSERT INTO reader_markers
       (invitation_id, project_id, chapter_id, scene_id, marker_id, marker_type,
        marker_text, highlighted_text, position_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        inv.id,
        inv.project_id,
        chapterId,
        sceneId,
        markerId,
        markerType,
        markerText,
        highlightedText,
        JSON.stringify(positionData)
      ]
    );

    // Update last activity
    await db.query(
      'UPDATE reader_invitations SET last_activity_at = NOW() WHERE id = $1',
      [inv.id]
    );

    res.status(201).json({ marker: marker.rows[0] });
  } catch (err) {
    console.error('Error creating reader marker:', err);
    res.status(500).json({ error: 'Failed to create marker' });
  }
});

// @route   GET /api/readers/my-markers/:token
// @desc    Get all markers created by this reader
// @access  Public (token-based)
router.get('/my-markers/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const markers = await db.query(
      `SELECT rm.*
       FROM reader_markers rm
       JOIN reader_invitations ri ON ri.id = rm.invitation_id
       WHERE ri.access_token = $1
       ORDER BY rm.created_at ASC`,
      [token]
    );

    res.json({ markers: markers.rows });
  } catch (err) {
    console.error('Error fetching reader markers:', err);
    res.status(500).json({ error: 'Failed to fetch markers' });
  }
});

// @route   PUT /api/readers/markers/:markerId
// @desc    Update a reader marker
// @access  Public (token-based)
router.put('/markers/:markerId', async (req, res) => {
  const { markerId } = req.params;
  const { accessToken, markerText } = req.body;

  try {
    const result = await db.query(
      `UPDATE reader_markers rm
       SET marker_text = $1, updated_at = NOW()
       FROM reader_invitations ri
       WHERE rm.id = $2 AND rm.invitation_id = ri.id AND ri.access_token = $3
       RETURNING rm.*`,
      [markerText, markerId, accessToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Marker not found or unauthorized' });
    }

    res.json({ marker: result.rows[0] });
  } catch (err) {
    console.error('Error updating marker:', err);
    res.status(500).json({ error: 'Failed to update marker' });
  }
});

// @route   DELETE /api/readers/markers/:markerId
// @desc    Delete a reader marker
// @access  Public (token-based)
router.delete('/markers/:markerId', async (req, res) => {
  const { markerId } = req.params;
  const { accessToken } = req.body;

  try {
    const result = await db.query(
      `DELETE FROM reader_markers rm
       USING reader_invitations ri
       WHERE rm.id = $1 AND rm.invitation_id = ri.id AND ri.access_token = $2
       RETURNING rm.id`,
      [markerId, accessToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Marker not found or unauthorized' });
    }

    res.json({ message: 'Marker deleted successfully' });
  } catch (err) {
    console.error('Error deleting marker:', err);
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

// @route   POST /api/readers/progress
// @desc    Update reader progress
// @access  Public (token-based)
router.post('/progress', async (req, res) => {
  const { accessToken, chapterId, completionPercentage } = req.body;

  try {
    const invitation = await db.query(
      'SELECT id FROM reader_invitations WHERE access_token = $1',
      [accessToken]
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const invId = invitation.rows[0].id;

    // Update session
    await db.query(
      `UPDATE reader_sessions
       SET last_chapter_id = $1, completion_percentage = $2, last_activity_at = NOW()
       WHERE invitation_id = $3`,
      [chapterId, completionPercentage, invId]
    );

    // Update invitation activity
    await db.query(
      'UPDATE reader_invitations SET last_activity_at = NOW() WHERE id = $1',
      [invId]
    );

    res.json({ message: 'Progress updated' });
  } catch (err) {
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// @route   POST /api/readers/notes
// @desc    Update reader notes
// @access  Public (token-based)
router.post('/notes', async (req, res) => {
  const { accessToken, notes } = req.body;

  try {
    const invitation = await db.query(
      'SELECT id FROM reader_invitations WHERE access_token = $1',
      [accessToken]
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid access token' });
    }

    const invId = invitation.rows[0].id;

    // Update notes in session
    const result = await db.query(
      `UPDATE reader_sessions
       SET notes = $1, last_activity_at = NOW()
       WHERE invitation_id = $2
       RETURNING notes`,
      [notes, invId]
    );

    // Update invitation activity
    await db.query(
      'UPDATE reader_invitations SET last_activity_at = NOW() WHERE id = $1',
      [invId]
    );

    res.json({ notes: result.rows[0]?.notes || '' });
  } catch (err) {
    console.error('Error updating notes:', err);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// @route   GET /api/readers/notes/:token
// @desc    Get reader notes
// @access  Public (token-based)
router.get('/notes/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      `SELECT rs.notes
       FROM reader_sessions rs
       JOIN reader_invitations ri ON ri.id = rs.invitation_id
       WHERE ri.access_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ notes: result.rows[0].notes || '' });
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

module.exports = router;
