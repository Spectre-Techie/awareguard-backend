/**
 * quizzes.js - Quiz API Routes
 * Location: awareguard-backend/routes/api/quizzes.js
 * 
 * Endpoints:
 * GET  /api/quizzes/:moduleId - Get quiz for a module
 * POST /api/quizzes/:quizId/submit - Submit quiz answers
 * GET  /api/quizzes/user/:userId/attempts - Get user's quiz attempts
 * GET  /api/quizzes/user/:userId/module/:moduleId - Get attempts for module
 */

import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import validateQuiz from '../../middleware/validateQuiz.js';
import * as quizController from '../../controllers/quizController.js';

const router = express.Router();

/**
 * GET /api/quizzes/:moduleId
 * Get quiz questions for a specific module
 * 
 * Params:
 *   - moduleId (string): Module identifier
 * 
 * Returns:
 *   - questions (array): Quiz questions with options (WITHOUT correct answers)
 *   - quizId (string): Quiz identifier
 *   - passingScore (number): % needed to pass
 *   - timeLimit (number): Time limit in seconds (optional)
 */
router.get('/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;

    const questions = await quizController.getQuizQuestions(moduleId);

    if (!questions || questions.length === 0) {
      return res.status(404).json({
        message: 'No quiz found for this module',
        status: 'not_found'
      });
    }

    // Don't send correct answers to frontend
    const safeQuestions = questions.map(q => ({
      questionId: q.questionId,
      questionText: q.questionText,
      type: q.type,
      options: q.options,
      difficulty: q.difficulty,
      points: q.points,
      // Exclude: correctAnswer, explanation, etc.
    }));

    res.json({
      moduleId,
      quizId: `quiz-${moduleId}`,
      questions: safeQuestions,
      totalQuestions: safeQuestions.length,
      passingScore: 70,
      timeLimit: 1800, // 30 minutes in seconds
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({
      message: 'Error fetching quiz',
      error: error.message,
      status: 'error'
    });
  }
});

/**
 * POST /api/quizzes/:quizId/submit
 * Submit quiz answers and get scoring
 * 
 * Requires: Authentication
 * 
 * Body:
 *   - moduleId (string): Module being tested
 *   - answers (array): User's answers
 *     - questionId (string)
 *     - selectedOption (number): 0-3
 *   - timeSpentSeconds (number): Time taken
 * 
 * Returns:
 *   - score (number): Total points earned
 *   - percentage (number): Score percentage
 *   - passed (boolean): True if percentage >= passingScore
 *   - xpEarned (number): XP gained from quiz
 *   - answers (array): Detailed answer breakdown
 *   - feedback (array): Explanation for each question
 */
router.post('/:quizId/submit', authMiddleware, validateQuiz, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { moduleId, answers, timeSpentSeconds } = req.body;
    const userId = req.user.id;

    // Score the quiz
    const result = await quizController.scoreQuiz(
      moduleId,
      answers,
      userId,
      timeSpentSeconds
    );

    // Save the submission
    await quizController.saveQuizSubmission(
      userId,
      moduleId,
      result,
      timeSpentSeconds
    );

    // If passed, award XP
    if (result.passed) {
      await quizController.awardQuizXP(userId, moduleId, result.xpEarned);
    }

    res.json({
      status: 'success',
      score: result.score,
      percentage: result.percentage,
      passed: result.passed,
      xpEarned: result.xpEarned,
      answers: result.answers,
      feedback: result.feedback,
      message: result.passed ? 'Quiz passed! XP awarded.' : 'Quiz failed. Try again.'
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({
      message: 'Error submitting quiz',
      error: error.message,
      status: 'error'
    });
  }
});

/**
 * GET /api/quizzes/user/:userId/attempts
 * Get all quiz attempts for a user
 * 
 * Requires: Authentication (user must be own user or admin)
 * 
 * Params:
 *   - userId: User's ID
 * 
 * Query:
 *   - limit (number): Max attempts to return (default: 20)
 *   - offset (number): Pagination offset (default: 0)
 * 
 * Returns:
 *   - attempts (array): User's quiz submissions
 *   - totalAttempts (number): Total quiz attempts ever
 *   - passRate (number): Percentage of quizzes passed
 */
router.get('/user/:userId/attempts', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Check authorization
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized to view this user\'s attempts',
        status: 'forbidden'
      });
    }

    const attempts = await quizController.getUserQuizAttempts(
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      status: 'success',
      attempts: attempts.data,
      totalAttempts: attempts.total,
      passRate: attempts.passRate,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    res.status(500).json({
      message: 'Error fetching quiz attempts',
      error: error.message,
      status: 'error'
    });
  }
});

/**
 * GET /api/quizzes/user/:userId/module/:moduleId
 * Get quiz attempts for a specific module
 * 
 * Requires: Authentication
 * 
 * Returns:
 *   - attempts (array): Attempts for this module
 *   - bestScore (number): Highest percentage achieved
 *   - averageScore (number): Average percentage
 *   - totalAttempts (number): Number of attempts
 *   - passed (boolean): Has user ever passed this quiz
 */
router.get('/user/:userId/module/:moduleId', authMiddleware, async (req, res) => {
  try {
    const { userId, moduleId } = req.params;

    // Check authorization
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Not authorized',
        status: 'forbidden'
      });
    }

    const results = await quizController.getModuleQuizAttempts(userId, moduleId);

    res.json({
      status: 'success',
      moduleId,
      attempts: results.attempts,
      bestScore: results.bestScore,
      averageScore: results.averageScore,
      totalAttempts: results.totalAttempts,
      passed: results.passed,
      currentAttempt: results.currentAttempt
    });
  } catch (error) {
    console.error('Error fetching module quiz attempts:', error);
    res.status(500).json({
      message: 'Error fetching quiz attempts',
      error: error.message,
      status: 'error'
    });
  }
});

/**
 * GET /api/quizzes/stats/module/:moduleId
 * Get quiz statistics for a module (admin only)
 * 
 * Returns:
 *   - averageScore (number)
 *   - passRate (number)
 *   - totalAttempts (number)
 *   - difficulty (string)
 */
router.get('/stats/module/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const stats = await quizController.getModuleQuizStats(moduleId);

    res.json({
      status: 'success',
      ...stats
    });
  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    res.status(500).json({
      message: 'Error fetching statistics',
      error: error.message,
      status: 'error'
    });
  }
});

export default router;
