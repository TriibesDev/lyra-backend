// routes/admin.js
// Admin-only API endpoints for user management and system administration

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin, requireSuperAdmin } = require('../middleware/adminAuth');
const db = require('../db');

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// @route   GET /api/admin/users
// @desc    Get all users (paginated)
// @access  Admin
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query = `
      SELECT
        user_id, username, email, first_name, last_name,
        subscription_status, role, created_at, trial_started_at
      FROM users
    `;
    let countQuery = 'SELECT COUNT(*) FROM users';
    const queryParams = [];
    const countParams = [];

    // Add search functionality
    if (search) {
      query += ` WHERE email ILIKE $1 OR username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`;
      countQuery += ` WHERE email ILIKE $1 OR username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`;
      queryParams.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const [usersResult, countResult] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, countParams)
    ]);

    const totalUsers = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      users: usersResult.rows,
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages
      }
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get single user details
// @access  Admin
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await db.query(
      `SELECT
        user_id, username, email, first_name, last_name, bio,
        city, state, country, subscription_status, role,
        created_at, trial_started_at, login_to_last_project,
        last_project_id, last_view
      FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's project count
    const projectCount = await db.query(
      'SELECT COUNT(*) FROM projects WHERE user_id = $1',
      [userId]
    );

    const user = {
      ...userResult.rows[0],
      project_count: parseInt(projectCount.rows[0].count)
    };

    res.json(user);
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PATCH /api/admin/users/:userId
// @desc    Update user (change role, subscription, etc.)
// @access  Admin
router.patch('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      role,
      subscription_status,
      subscription_tier,
      next_billing_date,
      special_access_end_date,
      email,
      username
    } = req.body;

    // Prevent non-superadmins from modifying superadmins
    const targetUser = await db.query('SELECT role FROM users WHERE user_id = $1', [userId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.rows[0].role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot modify superadmin users' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (role !== undefined) {
      // Only superadmins can change roles
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only superadmins can change user roles' });
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (subscription_status !== undefined) {
      updates.push(`subscription_status = $${paramIndex++}`);
      values.push(subscription_status);
    }

    if (subscription_tier !== undefined) {
      updates.push(`subscription_tier = $${paramIndex++}`);
      values.push(subscription_tier || null);
    }

    if (next_billing_date !== undefined) {
      updates.push(`next_billing_date = $${paramIndex++}`);
      values.push(next_billing_date || null);
    }

    if (special_access_end_date !== undefined) {
      updates.push(`special_access_end_date = $${paramIndex++}`);
      values.push(special_access_end_date || null);
    }

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }

    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(userId);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING user_id, username, email, role, subscription_status, subscription_tier,
                next_billing_date, special_access_end_date, created_at
    `;

    const result = await db.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/admin/users/:userId
// @desc    Delete user and all their data
// @access  Superadmin only
router.delete('/users/:userId', requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting yourself
    if (parseInt(userId) === req.user.user_id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const userResult = await db.query('SELECT role FROM users WHERE user_id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's projects first (cascade should handle this, but being explicit)
    await db.query('DELETE FROM projects WHERE user_id = $1', [userId]);

    // Delete user's refresh tokens
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    // Delete the user
    await db.query('DELETE FROM users WHERE user_id = $1', [userId]);

    res.json({ message: 'User and all associated data deleted successfully' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/admin/stats
// @desc    Get system statistics
// @access  Admin
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      activeSubscriptions,
      trialUsers,
      totalProjects,
      usersToday
    ] = await Promise.all([
      db.query('SELECT COUNT(*) FROM users'),
      db.query("SELECT COUNT(*) FROM users WHERE subscription_status = 'active'"),
      db.query("SELECT COUNT(*) FROM users WHERE subscription_status = 'trial'"),
      db.query('SELECT COUNT(*) FROM projects'),
      db.query('SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE')
    ]);

    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      activeSubscriptions: parseInt(activeSubscriptions.rows[0].count),
      trialUsers: parseInt(trialUsers.rows[0].count),
      totalProjects: parseInt(totalProjects.rows[0].count),
      usersRegisteredToday: parseInt(usersToday.rows[0].count)
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/admin/email-settings
// @desc    Get SMTP email configuration
// @access  Admin
router.get('/email-settings', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT smtp_host, smtp_port, smtp_user, from_email, from_name, use_tls FROM email_settings LIMIT 1'
    );

    if (result.rows.length === 0) {
      return res.json({
        smtp_host: '',
        smtp_port: 587,
        smtp_user: '',
        from_email: '',
        from_name: 'Lyra',
        use_tls: true
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get email settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/admin/email-settings
// @desc    Update SMTP email configuration
// @access  Admin
router.put('/email-settings', async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName } = req.body;

    // Validate required fields
    if (!smtpHost || !smtpPort || !smtpUser || !fromEmail) {
      return res.status(400).json({ error: 'Missing required email settings' });
    }

    // Check if settings exist
    const existing = await db.query('SELECT id FROM email_settings LIMIT 1');

    let query;
    let values;

    if (existing.rows.length === 0) {
      // Insert new settings
      query = `
        INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING smtp_host, smtp_port, smtp_user, from_email, from_name
      `;
      values = [smtpHost, smtpPort, smtpUser, smtpPass || '', fromEmail, fromName || 'Lyra'];
    } else {
      // Update existing settings
      // Only update password if provided
      if (smtpPass && smtpPass.trim() !== '') {
        query = `
          UPDATE email_settings
          SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_pass = $4,
              from_email = $5, from_name = $6
          WHERE id = $7
          RETURNING smtp_host, smtp_port, smtp_user, from_email, from_name
        `;
        values = [smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName || 'Lyra', existing.rows[0].id];
      } else {
        query = `
          UPDATE email_settings
          SET smtp_host = $1, smtp_port = $2, smtp_user = $3,
              from_email = $4, from_name = $5
          WHERE id = $6
          RETURNING smtp_host, smtp_port, smtp_user, from_email, from_name
        `;
        values = [smtpHost, smtpPort, smtpUser, fromEmail, fromName || 'Lyra', existing.rows[0].id];
      }
    }

    const result = await db.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update email settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/admin/test-email
// @desc    Send a test email to verify SMTP configuration
// @access  Admin
router.post('/test-email', async (req, res) => {
  try {
    const { emailAddress } = req.body;

    if (!emailAddress) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Get email settings
    const settingsResult = await db.query(
      'SELECT smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, use_tls FROM email_settings LIMIT 1'
    );

    if (settingsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Email settings not configured. Please configure SMTP settings first.' });
    }

    const settings = settingsResult.rows[0];

    // Import nodemailer dynamically
    const nodemailer = require('nodemailer');

    // Log configuration for debugging (without password)
    console.log('Email configuration:', {
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      user: settings.smtp_user,
      from_email: settings.from_email,
      from_name: settings.from_name
    });

    // Create transporter with proper SSL/TLS configuration
    const transportConfig = {
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port),
      secure: parseInt(settings.smtp_port) === 465, // true for 465, false for other ports
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_pass
      }
    };

    // Add TLS options based on port
    if (parseInt(settings.smtp_port) === 465) {
      // SSL/TLS (port 465)
      transportConfig.tls = {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      };
    } else {
      // STARTTLS (port 587 or 25)
      transportConfig.secure = false;
      transportConfig.requireTLS = true;
      transportConfig.tls = {
        rejectUnauthorized: false
      };
    }

    const transporter = nodemailer.createTransport(transportConfig);

    // Verify connection
    console.log('Attempting to verify SMTP connection...');
    await transporter.verify();

    // Send test email
    await transporter.sendMail({
      from: `"${settings.from_name}" <${settings.from_email}>`,
      to: emailAddress,
      subject: 'Test Email from Lyra',
      text: 'This is a test email to verify your SMTP configuration is working correctly.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Test Email from Lyra</h2>
          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
          <p>If you received this email, your email settings are properly configured!</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            This email was sent from the Admin panel of Lyra.
          </p>
        </div>
      `
    });

    res.json({ message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      details: error.message
    });
  }
});

// @route   GET /api/admin/tiers
// @desc    Get all membership tiers
// @access  Admin
router.get('/tiers', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, slug, limits, features, price_monthly, price_annual,
              is_active, display_order, created_at, updated_at
       FROM membership_tiers
       ORDER BY display_order ASC, id ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get tiers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/admin/tiers/:tierId
// @desc    Update a membership tier
// @access  Admin
router.put('/tiers/:tierId', async (req, res) => {
  try {
    const { tierId } = req.params;
    const {
      name,
      slug,
      limits,
      features,
      price_monthly,
      price_annual,
      is_active,
      display_order
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (slug !== undefined) {
      updates.push(`slug = $${paramIndex++}`);
      values.push(slug);
    }

    if (limits !== undefined) {
      updates.push(`limits = $${paramIndex++}`);
      values.push(JSON.stringify(limits));
    }

    if (features !== undefined) {
      updates.push(`features = $${paramIndex++}`);
      values.push(JSON.stringify(features));
    }

    if (price_monthly !== undefined) {
      updates.push(`price_monthly = $${paramIndex++}`);
      values.push(price_monthly);
    }

    if (price_annual !== undefined) {
      updates.push(`price_annual = $${paramIndex++}`);
      values.push(price_annual);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (display_order !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(display_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);
    values.push(tierId);

    const query = `
      UPDATE membership_tiers
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, slug, limits, features, price_monthly, price_annual,
                is_active, display_order, created_at, updated_at
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/admin/settings
// @desc    Get all system settings
// @access  Admin
router.get('/settings', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, setting_key, setting_value, description, updated_at
       FROM system_settings
       ORDER BY setting_key ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/admin/settings/:settingId
// @desc    Update a system setting
// @access  Admin
router.put('/settings/:settingId', async (req, res) => {
  try {
    const { settingId } = req.params;
    const { setting_value } = req.body;

    if (setting_value === undefined) {
      return res.status(400).json({ error: 'setting_value is required' });
    }

    const result = await db.query(
      `UPDATE system_settings
       SET setting_value = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3
       RETURNING id, setting_key, setting_value, description, updated_at`,
      [setting_value, req.user.user_id, settingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update system setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
