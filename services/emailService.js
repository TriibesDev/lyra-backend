// services/emailService.js
// Email sending service for beta reader invitations and notifications

const nodemailer = require('nodemailer');
const db = require('../db');

/**
 * Get the configured email transporter
 * @returns {Promise<nodemailer.Transporter>} Configured nodemailer transporter
 */
async function getTransporter() {
  // Get email settings from database
  const result = await db.query(
    'SELECT smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name, use_tls FROM email_settings LIMIT 1'
  );

  if (result.rows.length === 0) {
    throw new Error('Email settings not configured. Please configure SMTP settings in the Admin panel.');
  }

  const settings = result.rows[0];

  // Create transporter configuration
  const transportConfig = {
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port),
    secure: parseInt(settings.smtp_port) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    }
  };

  // Add TLS options based on port
  if (parseInt(settings.smtp_port) === 465) {
    transportConfig.tls = {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    };
  } else {
    transportConfig.secure = false;
    transportConfig.requireTLS = true;
    transportConfig.tls = {
      rejectUnauthorized: false
    };
  }

  return {
    transporter: nodemailer.createTransport(transportConfig),
    fromEmail: settings.from_email,
    fromName: settings.from_name
  };
}

/**
 * Send beta reader invitation email
 * @param {Object} params - Email parameters
 * @param {string} params.readerEmail - Reader's email address
 * @param {string} params.readerName - Reader's name
 * @param {string} params.projectTitle - Project/manuscript title
 * @param {string} params.authorName - Author's name
 * @param {string} params.accessToken - Unique access token for the reader
 * @param {string} params.expiresAt - Expiration date
 * @param {string} params.invitationMessage - Custom message from the author
 * @param {string[]} params.chapterNames - List of chapter names
 * @returns {Promise<void>}
 */
async function sendReaderInvitation({
  readerEmail,
  readerName,
  projectTitle,
  authorName,
  accessToken,
  expiresAt,
  invitationMessage,
  chapterNames
}) {
  try {
    const { transporter, fromEmail, fromName } = await getTransporter();

    // Build the reader access URL
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const readerUrl = `${clientUrl}/reader/${accessToken}`;

    // Format expiration date
    const expirationDate = new Date(expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Build chapter list HTML
    const chapterListHtml = chapterNames
      .map((name, index) => `<li style="margin: 5px 0;">Chapter ${index + 1}: ${name}</li>`)
      .join('');

    // Email subject
    const subject = `Beta Reader Invitation: ${projectTitle}`;

    // Plain text version
    const textContent = `
Hi ${readerName},

${authorName} has invited you to be a beta reader for their manuscript "${projectTitle}".

${invitationMessage}

CHAPTERS AVAILABLE:
${chapterNames.map((name, index) => `Chapter ${index + 1}: ${name}`).join('\n')}

ACCESS LINK:
${readerUrl}

This invitation expires on ${expirationDate}.

To access the manuscript, click the link above or paste it into your browser. You'll be able to read the chapters and leave feedback using our annotation tools.

Thank you for being a beta reader!

---
Sent via CodexScribe
    `.trim();

    // HTML version
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #3b82f6; margin: 0; font-size: 24px;">Beta Reader Invitation</h1>
      <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">You've been invited to review a manuscript</p>
    </div>

    <!-- Greeting -->
    <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${readerName}</strong>,</p>

    <!-- Main Message -->
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${authorName}</strong> has invited you to be a beta reader for their manuscript
      <strong style="color: #3b82f6;">"${projectTitle}"</strong>.
    </p>

    <!-- Custom Author Message -->
    <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-style: italic; color: #4b5563;">${invitationMessage.replace(/\n/g, '<br>')}</p>
    </div>

    <!-- Chapters Available -->
    <div style="margin: 25px 0;">
      <h2 style="font-size: 18px; color: #1f2937; margin-bottom: 10px;">Chapters Available:</h2>
      <ul style="list-style-type: none; padding: 0; margin: 0;">
        ${chapterListHtml}
      </ul>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${readerUrl}"
         style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.4);">
        Access Manuscript
      </a>
    </div>

    <!-- Expiration Notice -->
    <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; padding: 12px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        ⏰ <strong>Note:</strong> This invitation expires on <strong>${expirationDate}</strong>
      </p>
    </div>

    <!-- Instructions -->
    <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <h3 style="font-size: 16px; color: #1f2937; margin-bottom: 10px;">How It Works:</h3>
      <ol style="color: #4b5563; font-size: 14px; padding-left: 20px;">
        <li style="margin: 5px 0;">Click the "Access Manuscript" button above</li>
        <li style="margin: 5px 0;">Read through the available chapters</li>
        <li style="margin: 5px 0;">Use the annotation tools to leave feedback and comments</li>
        <li style="margin: 5px 0;">Your feedback will be sent directly to the author</li>
      </ol>
    </div>

    <!-- Footer -->
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">
        Thank you for being a beta reader!
      </p>
      <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0 0;">
        Sent via <strong>CodexScribe</strong> - Creative Writing Platform
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    // Send the email
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: readerEmail,
      subject,
      text: textContent,
      html: htmlContent
    });

    console.log(`✅ Beta reader invitation sent to ${readerEmail}`);
  } catch (error) {
    console.error('Error sending beta reader invitation:', error);
    throw error;
  }
}

/**
 * Send password reset email
 * @param {Object} params - Email parameters
 * @param {string} params.email - User's email address
 * @param {string} params.username - User's username
 * @param {string} params.resetToken - Password reset token
 * @returns {Promise<void>}
 */
async function sendPasswordResetEmail({ email, username, resetToken }) {
  try {
    const { transporter, fromEmail, fromName } = await getTransporter();

    // Build the reset URL
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    // Email subject
    const subject = 'Reset Your CodexScribe Password';

    // Plain text version
    const textContent = `
Hi ${username || 'there'},

We received a request to reset your password for your CodexScribe account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

For security, please do not share this link with anyone.

---
CodexScribe - Writing Tools for Storytellers
    `.trim();

    // HTML version
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1c2c3b; margin: 0; font-size: 24px;">Reset Your Password</h1>
      <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">CodexScribe Account Security</p>
    </div>

    <!-- Greeting -->
    <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${username || 'there'}</strong>,</p>

    <!-- Main Message -->
    <p style="font-size: 16px; margin-bottom: 20px;">
      We received a request to reset the password for your CodexScribe account. Click the button below to create a new password.
    </p>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="display: inline-block; background-color: #003666; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(0, 54, 102, 0.4);">
        Reset Password
      </a>
    </div>

    <!-- Expiration Notice -->
    <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; padding: 12px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        ⏰ <strong>Note:</strong> This link will expire in <strong>1 hour</strong>
      </p>
    </div>

    <!-- Alternative Link -->
    <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 14px; color: #4b5563;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 12px; color: #6b7280; word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 4px;">
        ${resetUrl}
      </p>
    </div>

    <!-- Security Notice -->
    <div style="margin-top: 25px; padding: 15px; background-color: #f9fafb; border-radius: 4px;">
      <p style="font-size: 14px; color: #4b5563; margin: 0;">
        <strong>Didn't request this?</strong><br>
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>

    <!-- Footer -->
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 11px; margin: 0;">
        <strong>CodexScribe</strong> - Writing Tools for Storytellers
      </p>
      <p style="color: #9ca3af; font-size: 11px; margin: 10px 0 0 0;">
        For security, please do not share this link with anyone.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    // Send the email
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject,
      text: textContent,
      html: htmlContent
    });

    console.log(`✅ Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

module.exports = {
  getTransporter,
  sendReaderInvitation,
  sendPasswordResetEmail
};
