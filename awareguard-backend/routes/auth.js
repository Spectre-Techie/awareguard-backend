// awareguard-backend/routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordResetConfirmation } from "../utils/emailService.js";
import { createPasswordResetToken, hashToken, generateResetToken } from "../utils/tokenUtils.js";
import logger from "../utils/logger.js";

const router = express.Router();

// ===== REDIRECT VALIDATION =====
const ALLOWED_REDIRECT_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

function validateRedirectUrl(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_ORIGINS.includes(parsed.origin);
  } catch {
    return false;
  }
}

// ===== JWT HELPERS =====

// Determine role based on env-based admin credentials
function getUserRole(user) {
  return user.email === process.env.ADMIN_EMAIL ? 'admin' : 'user';
}

// Create access token (7 days)
function createToken(user) {
  const role = getUserRole(user);
  return jwt.sign({ sub: user._id, email: user.email, role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// Create refresh token (30 days)
function createRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Hash refresh token for storage
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ===== REFRESH TOKEN COOKIE HELPER =====
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',    // required for cross-origin (Netlify → Render)
  path: '/api/auth',   // only sent to auth endpoints
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function setRefreshCookie(res, refreshToken) {
  res.cookie('AG_REFRESH', refreshToken, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res) {
  res.clearCookie('AG_REFRESH', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/api/auth',
  });
}

// Simple in-memory rate limiting (use Redis in production)
const resetAttempts = new Map();

function checkRateLimit(email) {
  const now = Date.now();
  const attempts = resetAttempts.get(email) || [];

  // Remove attempts older than 1 hour
  const recentAttempts = attempts.filter(time => now - time < 60 * 60 * 1000);

  if (recentAttempts.length >= 3) {
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

    // Explicitly remove paystackReference and googleId so they are
    // truly absent (undefined) rather than null — this lets the
    // MongoDB sparse unique index work correctly.
    user.paystackReference = undefined;
    user.googleId = undefined;

    await user.save();

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch(err =>
      logger.error('Failed to send welcome email', { error: err.message })
    );

    // Create access token and refresh token
    const token = createToken(user);
    const refreshToken = createRefreshToken();

    // Store hashed refresh token
    user.refreshTokens.push({
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
    await user.save();

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, refreshToken);

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, isPremium: user.isPremium, role: 'user' }
    });
  } catch (err) {
    // Handle the specific duplicate key error on paystackReference
    if (err.code === 11000 && err.keyPattern?.paystackReference) {
      logger.error('paystackReference index conflict', { error: err.message });
      return res.status(500).json({
        error: "Signup temporarily unavailable. Please contact support."
      });
    }
    logger.error('Signup failed', { error: err.message, stack: err.stack });
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
    const refreshToken = createRefreshToken();

    // Store hashed refresh token
    user.refreshTokens.push({
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await user.save();

    // Set refresh token as httpOnly cookie
    setRefreshCookie(res, refreshToken);

    const role = getUserRole(user);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, isPremium: user.isPremium, role }
    });
  } catch (err) {
    logger.error('Signin failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Signin failed" });
  }
});

// POST /api/auth/refresh
// Refresh access token using httpOnly cookie refresh token (with rotation)
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.AG_REFRESH;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const hashedToken = hashRefreshToken(refreshToken);
    const user = await User.findOne({ 'refreshTokens.tokenHash': hashedToken });

    if (!user) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Find and validate the token entry
    const tokenEntry = user.refreshTokens.find(t => t.tokenHash === hashedToken);
    if (!tokenEntry || tokenEntry.expiresAt < new Date()) {
      // Token expired or not found — revoke ALL tokens (potential theft)
      user.refreshTokens = [];
      await user.save();
      clearRefreshCookie(res);
      logger.warn('Expired/invalid refresh token detected', { userId: user._id });
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Rotate: remove old, create new
    user.refreshTokens = user.refreshTokens.filter(t => t.tokenHash !== hashedToken);
    const newRefreshToken = createRefreshToken();
    user.refreshTokens.push({
      tokenHash: hashRefreshToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await user.save();

    const accessToken = createToken(user);
    logger.info('Refresh token rotated', { userId: user._id });

    // Set new refresh token cookie
    setRefreshCookie(res, newRefreshToken);

    const role = getUserRole(user);
    res.json({ token: accessToken, user: { id: user._id, name: user.name, email: user.email, isPremium: user.isPremium, role } });
  } catch (err) {
    logger.error('Refresh token error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /api/auth/logout
// Server-side logout: revoke refresh token and clear cookie
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies?.AG_REFRESH;
    if (refreshToken) {
      const hashedToken = hashRefreshToken(refreshToken);
      const user = await User.findOne({ 'refreshTokens.tokenHash': hashedToken });
      if (user) {
        user.refreshTokens = user.refreshTokens.filter(t => t.tokenHash !== hashedToken);
        await user.save();
        logger.info('Refresh token revoked on logout', { userId: user._id });
      }
    }
    clearRefreshCookie(res);
    res.json({ success: true });
  } catch (err) {
    logger.error('Logout error', { error: err.message, stack: err.stack });
    clearRefreshCookie(res);
    res.json({ success: true });
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

// ===== GOOGLE OAUTH ROUTES =====

import passportConfig from '../config/passport.js';

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', passportConfig.authenticate('google', {
  scope: ['profile', 'email'],
  session: false
}));

/**
 * GET /api/auth/google/callback
 * Google OAuth callback - handle success/failure
 */
router.get('/google/callback',
  passportConfig.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/signin?error=oauth_failed` }),
  async (req, res) => {
    try {
      // User authenticated successfully via Google
      const user = req.user;

      // Generate JWT token
      const token = createToken(user);

      // Generate refresh token for OAuth users too
      const refreshToken = createRefreshToken();
      user.refreshTokens.push({
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      await user.save();

      // Set refresh token as httpOnly cookie
      setRefreshCookie(res, refreshToken);

      // Redirect to frontend with token + user (including role)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const role = getUserRole(user);
      res.redirect(`${frontendUrl}/auth/google/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        role
      }))}`);
    } catch (err) {
      logger.error('Google OAuth callback error', { error: err.message, stack: err.stack });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/signin?error=oauth_failed`);
    }
  }
);

// ===== ADMIN ENDPOINT - ONE-TIME DATABASE FIX =====

/**
 * POST /api/auth/admin/fix-paystack-index
 * ONE-TIME endpoint to fix the paystackReference duplicate key error
 * Call this once, then remove this endpoint
 */
router.post('/admin/fix-paystack-index', async (req, res) => {
  try {
    logger.info('Starting comprehensive index fix');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Get all existing indexes first
    const existingIndexes = await usersCollection.indexes();
    logger.info('Current indexes', { indexes: existingIndexes.map(idx => idx.name) });

    // Drop ALL paystackReference-related indexes
    const paystackIndexNames = existingIndexes
      .filter(idx => idx.name && idx.name.includes('paystackReference'))
      .map(idx => idx.name);

    const droppedIndexes = [];
    for (const indexName of paystackIndexNames) {
      try {
        await usersCollection.dropIndex(indexName);
        logger.info('Dropped index', { indexName });
        droppedIndexes.push(indexName);
      } catch (err) {
        logger.warn('Could not drop index', { indexName, error: err.message });
      }
    }

    // Create new sparse unique index
    await usersCollection.createIndex(
      { paystackReference: 1 },
      {
        unique: true,
        sparse: true,  // Allows multiple null values
        name: 'paystackReference_sparse_1'
      }
    );
    logger.info('Created new sparse unique index');

    // Verify the fix
    const newIndexes = await usersCollection.indexes();
    const paystackIndex = newIndexes.find(idx => idx.name === 'paystackReference_sparse_1');

    res.json({
      success: true,
      message: 'Index fixed successfully! OAuth signup should now work.',
      droppedIndexes,
      newIndex: paystackIndex,
      allIndexes: newIndexes.map(idx => ({
        name: idx.name,
        keys: idx.key,
        sparse: idx.sparse,
        unique: idx.unique
      }))
    });
  } catch (error) {
    logger.error('Error fixing index', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to fix index'
    });
  }
});

export default router;
