// awareguard-backend/routes/learning.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { User } from "../models/User.js";

const router = express.Router();

// ===== MODULE DEFINITIONS (Source of Truth for XP values) =====
// These match the frontend learningData.js XP values
const MODULES = {
  // Beginner Path
  "phishing-basics": { xp: 10, premium: false, title: "Phishing Awareness 101" },
  "password-security": { xp: 12, premium: false, title: "Password Security Essentials" },
  "job-scam": { xp: 15, premium: false, title: "Job Scam Detection" },
  "social-media-safety": { xp: 12, premium: false, title: "Social Media Security Essentials" },
  "online-shopping-security": { xp: 10, premium: false, title: "Online Shopping & Payment Security" },

  // Intermediate & Expert Paths (Premium)
  "social-engineering": { xp: 25, premium: true, title: "Social Engineering Tactics" },
  "identity-theft": { xp: 20, premium: true, title: "Identity Theft Prevention" },
  "advanced-phishing": { xp: 25, premium: true, title: "Advanced Phishing Detection" },
  "financial-fraud": { xp: 30, premium: true, title: "Financial Fraud & Investment Scams" },
  "mobile-security": { xp: 20, premium: true, title: "Mobile Device Security" },
  "corporate-security": { xp: 35, premium: true, title: "Corporate Security Best Practices" },
  "incident-response": { xp: 40, premium: true, title: "Incident Response & Recovery" }
};

/**
 * GET /api/learning/progress
 * Fetch user's complete learning progress
 * Returns: totalXP, level, completedModules, streak, badges, quizHistory
 */
router.get("/progress", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return comprehensive learning stats
    res.json({
      totalXP: user.totalXP || 0,
      level: user.level || 1,
      completedModules: user.completedModules || [],
      streak: user.streak || 0,
      lastActivity: user.lastActivity,
      badges: user.badges || [],
      perfectQuizzes: user.perfectQuizzes || 0,
      quizHistory: user.quizHistory || []
    });
  } catch (err) {
    console.error("Error fetching progress:", err);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

/**
 * POST /api/learning/complete
 * Complete a module and award XP
 * 
 * Request body:
 * - moduleId: string (required)
 * - xpGained: number (optional, will be validated against MODULES)
 * 
 * Returns: updated user stats
 */
router.post("/complete", authMiddleware, async (req, res) => {
  try {
    const { moduleId } = req.body;

    // Validation
    if (!moduleId) {
      return res.status(400).json({ error: "moduleId is required" });
    }

    // Check if module exists
    const module = MODULES[moduleId];
    if (!module) {
      return res.status(400).json({ error: `Invalid moduleId: ${moduleId}` });
    }

    // Fetch user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // CRITICAL: Check premium access
    if (module.premium && !user.isPremium) {
      return res.status(403).json({
        error: "Premium module requires subscription",
        moduleId,
        title: module.title,
        requiresPremium: true
      });
    }

    // Check if already completed (prevent duplicate XP)
    if (user.completedModules.includes(moduleId)) {
      return res.status(400).json({
        error: "Module already completed",
        message: "You've already completed this module. XP not awarded twice.",
        completedModules: user.completedModules
      });
    }

    // SERVER-SIDE XP VALIDATION (user cannot manipulate XP amounts)
    const xpToAward = module.xp;

    // Award XP and update level
    user.addXP(xpToAward);

    // Mark module as completed
    user.completeModule(moduleId);

    // Update streak
    const newStreak = user.updateStreak();

    // Save user
    await user.save();

    // Return updated stats
    res.json({
      success: true,
      message: `Module completed! +${xpToAward} XP`,
      xpGained: xpToAward,
      user: {
        totalXP: user.totalXP,
        level: user.level,
        completedModules: user.completedModules,
        streak: user.streak,
        lastActivity: user.lastActivity
      }
    });
  } catch (err) {
    console.error("Error completing module:", err);
    res.status(500).json({ error: "Failed to complete module" });
  }
});

/**
 * POST /api/learning/quiz-submit
 * Submit quiz results and track performance
 * 
 * Request body:
 * - quizId: string (required)
 * - score: number (required) - number of correct answers
 * - totalQuestions: number (required)
 * 
 * Returns: quiz stats and any badges earned
 */
router.post("/quiz-submit", authMiddleware, async (req, res) => {
  try {
    const { quizId, score, totalQuestions } = req.body;

    // Validation
    if (!quizId || score === undefined || !totalQuestions) {
      return res.status(400).json({
        error: "quizId, score, and totalQuestions are required"
      });
    }

    if (score < 0 || score > totalQuestions) {
      return res.status(400).json({
        error: "Invalid score: must be between 0 and totalQuestions"
      });
    }

    // Fetch user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add quiz result to history
    user.addQuizResult(quizId, score, totalQuestions);

    // Save user
    await user.save();

    // Calculate percentage
    const percentage = Math.round((score / totalQuestions) * 100);
    const passed = percentage >= 70; // 70% passing score

    // Return results
    res.json({
      success: true,
      quiz: {
        quizId,
        score,
        totalQuestions,
        percentage,
        passed,
        isPerfect: score === totalQuestions
      },
      user: {
        perfectQuizzes: user.perfectQuizzes,
        totalQuizzes: user.quizHistory.length
      }
    });
  } catch (err) {
    console.error("Error submitting quiz:", err);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

/**
 * GET /api/learning/stats
 * Get comprehensive learning statistics
 */
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Calculate additional stats
    const totalModules = Object.keys(MODULES).length;
    const freeModules = Object.values(MODULES).filter(m => !m.premium).length;
    const premiumModules = Object.values(MODULES).filter(m => m.premium).length;
    const completedCount = user.completedModules?.length || 0;
    const completionPercentage = Math.round((completedCount / totalModules) * 100);

    // XP to next level
    const currentLevelXP = (user.level - 1) * 500;
    const nextLevelXP = user.level * 500;
    const xpToNextLevel = nextLevelXP - user.totalXP;
    const levelProgress = Math.round(((user.totalXP - currentLevelXP) / 500) * 100);

    res.json({
      learningStats: {
        totalXP: user.totalXP || 0,
        level: user.level || 1,
        levelProgress,
        xpToNextLevel,
        completedModules: completedCount,
        totalModules,
        completionPercentage,
        streak: user.streak || 0,
        lastActivity: user.lastActivity,
        badges: user.badges || [],
        badgeCount: user.badges?.length || 0,
        perfectQuizzes: user.perfectQuizzes || 0,
        totalQuizzes: user.quizHistory?.length || 0
      },
      accessInfo: {
        isPremium: user.isPremium || false,
        freeModulesAvailable: freeModules,
        premiumModulesAvailable: premiumModules,
        subscriptionPlan: user.subscriptionPlan || 'none',
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * GET /api/learning/leaderboard
 * Get top users by XP
 * 
 * Query params:
 * - timeframe: 'all' | 'month' | 'week' (default: 'all')
 * - limit: number (default: 50, max: 100)
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const { timeframe = 'all', limit = 50 } = req.query;
    const maxLimit = Math.min(parseInt(limit), 100);

    let query = {};

    if (timeframe === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.lastActivity = { $gte: weekAgo };
    } else if (timeframe === 'month') {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query.lastActivity = { $gte: monthAgo };
    }

    const users = await User
      .find(query)
      .select('name totalXP level streak badges')
      .sort({ totalXP: -1 })
      .limit(maxLimit)
      .lean();

    // Add rank
    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      name: user.name,
      totalXP: user.totalXP || 0,
      level: user.level || 1,
      streak: user.streak || 0,
      badgeCount: user.badges?.length || 0
    }));

    res.json({
      leaderboard,
      timeframe,
      totalUsers: leaderboard.length
    });
  } catch (err) {
    console.error("Error fetching leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
