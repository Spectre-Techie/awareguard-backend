// awareguard-backend/utils/emailService.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} resetToken - Password reset token
 * @param {string} userName - User's name
 */
export async function sendPasswordResetEmail(email, resetToken, userName = 'User') {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'AwareGuard <noreply@awareguard.me>',
      to: email,
      subject: 'Reset Your Password - AwareGuard',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border-radius: 10px;
              padding: 40px;
              color: white;
            }
            .content {
              background: white;
              border-radius: 8px;
              padding: 30px;
              margin-top: 20px;
              color: #333;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 14px 28px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 12px;
              margin: 20px 0;
              border-radius: 4px;
              color: #92400e;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 style="margin: 0; font-size: 28px;">🔐 Password Reset Request</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">AwareGuard Security Platform</p>
          </div>
          
          <div class="content">
            <p>Hi <strong>${userName}</strong>,</p>
            
            <p>We received a request to reset your password for your AwareGuard account. Click the button below to create a new password:</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset My Password</a>
            </div>
            
            <div class="warning">
              <strong>⏰ This link expires in 1 hour</strong><br>
              For security reasons, this password reset link will only work once and expires after 60 minutes.
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea; font-size: 14px;">${resetUrl}</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 14px; color: #666;">
              <strong>Didn't request this?</strong><br>
              If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2026 AwareGuard. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Password reset email sent:', data);
    return data;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
}

/**
 * Send password reset confirmation email
 * @param {string} email - User's email address
 * @param {string} userName - User's name
 */
export async function sendPasswordResetConfirmation(email, userName = 'User') {
  try {
    const { data, error } = await resend.emails.send({
      from: 'AwareGuard <noreply@awareguard.me>',
      to: email,
      subject: 'Password Successfully Reset - AwareGuard',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              border-radius: 10px;
              padding: 40px;
              color: white;
            }
            .content {
              background: white;
              border-radius: 8px;
              padding: 30px;
              margin-top: 20px;
              color: #333;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 style="margin: 0; font-size: 28px;">✅ Password Reset Successful</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">AwareGuard Security Platform</p>
          </div>
          
          <div class="content">
            <p>Hi <strong>${userName}</strong>,</p>
            
            <p>Your password has been successfully reset. You can now log in to your AwareGuard account with your new password.</p>
            
            <p style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 12px; border-radius: 4px; color: #065f46;">
              <strong>✓ Security Tip:</strong> Make sure to use a strong, unique password and consider enabling two-factor authentication for added security.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="font-size: 14px; color: #666;">
              <strong>Didn't make this change?</strong><br>
              If you didn't reset your password, please contact our support team immediately at <a href="mailto:support@awareguard.com">support@awareguard.com</a>
            </p>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Password reset confirmation sent:', data);
    return data;
  } catch (error) {
    console.error('❌ Error sending confirmation email:', error);
    throw error;
  }
}

/**
 * Send welcome email for new users
 * @param {string} email - User's email address
 * @param {string} userName - User's name
 */
export async function sendWelcomeEmail(email, userName = 'User') {
  try {
    const { data, error } = await resend.emails.send({
      from: 'AwareGuard <welcome@awareguard.me>',
      to: email,
      subject: 'Welcome to AwareGuard! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border-radius: 10px;
              padding: 40px;
              color: white;
              text-align: center;
            }
            .content {
              background: white;
              border-radius: 8px;
              padding: 30px;
              margin-top: 20px;
              color: #333;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 14px 28px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 style="margin: 0; font-size: 32px;">🎉 Welcome to AwareGuard!</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">Your journey to digital security starts now</p>
          </div>
          
          <div class="content">
            <p>Hi <strong>${userName}</strong>,</p>
            
            <p>Thank you for joining AwareGuard! We're excited to help you protect yourself from online scams and threats.</p>
            
            <p><strong>Here's what you can do now:</strong></p>
            <ul style="text-align: left;">
              <li>🎓 Start learning with our free beginner modules</li>
              <li>🏆 Earn XP and level up as you complete lessons</li>
              <li>🔥 Build your learning streak</li>
              <li>🎖️ Unlock badges and achievements</li>
            </ul>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/learn" class="button">Start Learning</a>
            </div>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Need help? Reply to this email or visit our <a href="${process.env.FRONTEND_URL}/help">Help Center</a>.
            </p>
          </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      // Don't throw - welcome email is not critical
      return null;
    }

    console.log('✅ Welcome email sent:', data);
    return data;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    // Don't throw - welcome email is not critical
    return null;
  }
}
