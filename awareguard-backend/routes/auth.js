// awareguard-backend/routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordResetConfirmation } from "../utils/emailService.js";
import { createPasswordResetToken, hashToken } from "../utils/tokenUtils.js";

const router = express.Router();

// Create JWT
function createToken(user) {
  return jwt.sign({ sub: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// Simple in-memory rate limiting (use Redis in production)
const resetAttempts = new Map();

function checkRateLimit(email) {
  const now = Date.now();
  const attempts = resetAttempts.get(email) || [];

  // Remove attempts older than 1 hour
  const recentAttempts = attempts.filter(time => now - time < 60 * 60 * 1000);

  if (recentAttempts.length >= 5) {
    return false; // Too many attempts
  }

  recentAttempts.push(now);
  resetAttempts.set(email, recentAttempts);
  return true;
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const user = new User({ name, email });
    await user.setPassword(password);
    await user.save();

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch(err =>
      console.error('Failed to send welcome email:', err)
    );

    const token = createToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, isPremium: user.isPremium } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// POST /api/auth/signin
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await user.checkPassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = createToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, isPremium: user.isPremium } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signin failed" });
  }
});

// ===== PASSWORD RESET ROUTES =====

/**
 * POST /api/auth/forgot-password
 * Request password reset email
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Rate limiting check
    if (!checkRateLimit(email)) {
      return res.status(429).json({
        error: "Too many password reset attempts. Please try again later."
      });
    }

    // Find user (don't reveal if email exists for security)
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message: "If that email exists, a password reset link has been sent."
      });
    }

    // Generate reset token
    const { token, hashedToken, expires } = createPasswordResetToken();

    // Save hashed token to user
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = expires;
    await user.save();

    // Send email
    try {
      await sendPasswordResetEmail(email, token, user.name);
      console.log(`✅ Password reset email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
      // Clear the token if email fails
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save();

      return res.status(500).json({
        error: "Failed to send password reset email. Please try again later."
      });
    }

    res.json({
      success: true,
      message: "If that email exists, a password reset link has been sent."
    });
  } catch (err) {
    console.error('❌ Forgot password error:', err);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

/**
 * POST /api/auth/reset-password/:token
 * Reset password using token
 */
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "New password is required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Hash the token to compare with database
    const hashedToken = hashToken(token);

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: "Invalid or expired password reset token"
      });
    }

    // Set new password
    await user.setPassword(password);

    // Clear reset token
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();

    // Send confirmation email
    try {
      await sendPasswordResetConfirmation(user.email, user.name);
    } catch (emailError) {
      console.error('❌ Failed to send confirmation email:', emailError);
      // Don't fail the request if confirmation email fails
    }

    console.log(`✅ Password reset successful for: ${user.email}`);

    res.json({
      success: true,
      message: "Password reset successful. You can now log in with your new password."
    });
  } catch (err) {
    console.error('❌ Reset password error:', err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ===== GOOGLE OAUTH ROUTE (TO BE IMPLEMENTED) =====

/*
  Placeholder route for Google Sign-In token verification:
  Client obtains id_token from Google Sign-In and sends here.
  Backend should verify token with Google OAuth2 API (or use google-auth-library).
  For now: a stub returning success; replace with proper verification.
*/
router.post("/google", async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ error: "id_token required" });

    // TODO: verify token with Google: use google-auth-library to verify
    // If valid, get email and name, create or retrieve the user and return JWT.

    // Temporary: return error to remind to implement properly.
    return res.status(501).json({ error: "Google sign-in not configured on backend. See README." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Google signin failed" });
  }
});

export default router;
