/**
 * quizController.js - Quiz Business Logic
 * Location: awareguard-backend/controllers/quizController.js
 * 
 * Handles quiz scoring, XP calculations, and progress tracking
 */

const Quiz = require('../models/Quiz');
const UserProgress = require('../models/UserProgress');

/**
 * Get quiz questions for a module
 */
async function getQuizQuestions(moduleId) {
  try {
    const questions = await Quiz.find({ moduleId }).select('-correctAnswer -explanation -correctExplanation -incorrectExplanations');
    return questions;
  } catch (error) {
    console.error('Error fetching quiz questions:', error);
    throw error;
  }
}

/**
 * Score a quiz submission
 * Compares user answers against correct answers
 */
async function scoreQuiz(moduleId, userAnswers, userId, timeSpent) {
  try {
    const questions = await Quiz.find({ moduleId });
    
    if (!questions || questions.length === 0) {
      throw new Error('Quiz not found');
    }

    let totalPoints = 0;
    let earnedPoints = 0;
    const answeredQuestions = [];

    // Grade each answer
    for (let answer of userAnswers) {
      const question = questions.find(q => q.questionId === answer.questionId);
      
      if (!question) continue;

      const isCorrect = question.correctAnswer === answer.selectedOption;
      const pointsForQuestion = question.points || 10;
      
      totalPoints += pointsForQuestion;
      if (isCorrect) {
        earnedPoints += pointsForQuestion;
      }

      answeredQuestions.push({
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        correct: isCorrect,
        points: pointsForQuestion,
        explanation: isCorrect 
          ? question.correctExplanation 
          : question.incorrectExplanations?.find(e => e.optionIndex === answer.selectedOption)?.explanation
      });
    }

    const percentage = Math.round((earnedPoints / totalPoints) * 100);
    const passed = percentage >= 70; // 70% passing score
    
    // Calculate XP bonus
    // Base: 30% of module XP for passing
    // Module data needs to be looked up for XP value
    const xpEarned = passed ? 15 : 0; // Default 15 XP for passing (can vary by module)

    return {
      score: earnedPoints,
      totalPoints,
      percentage,
      passed,
      xpEarned,
      answers: answeredQuestions,
      feedback: answeredQuestions.map(a => ({
        questionId: a.questionId,
        correct: a.correct,
        explanation: a.explanation
      }))
    };
  } catch (error) {
    console.error('Error scoring quiz:', error);
    throw error;
  }
}

/**
 * Save quiz submission to user progress
 */
async function saveQuizSubmission(userId, moduleId, scoreResult, timeSpent) {
  try {
    const userProgress = await UserProgress.findOne({ userId });
    
    if (!userProgress) {
      throw new Error('User progress not found');
    }

    // Find or create completed module record
    let completedModule = userProgress.completedModules.find(m => m.moduleId === moduleId);
    
    if (!completedModule) {
      completedModule = {
        moduleId,
        completedAt: new Date(),
        xpEarned: 0,
        quizAttempts: [],
        lessonsCompleted: []
      };
      userProgress.completedModules.push(completedModule);
    }

    // Add quiz attempt
    completedModule.quizAttempts.push({
      quizId: `quiz-${moduleId}`,
      moduleId,
      submittedAt: new Date(),
      score: scoreResult.score,
      percentage: scoreResult.percentage,
      passed: scoreResult.passed,
      timeSpentSeconds: timeSpent,
      answers: scoreResult.answers
    });

    // Update statistics
    userProgress.statistics.totalQuizzesAttempted += 1;
    if (scoreResult.passed) {
      userProgress.statistics.totalQuizzesPass += 1;
    }
    userProgress.statistics.lastQuizCompletedAt = new Date();
    
    // Update average quiz score
    const allAttempts = userProgress.completedModules
      .flatMap(m => m.quizAttempts || []);
    const avgScore = allAttempts.reduce((sum, a) => sum + a.percentage, 0) / allAttempts.length;
    userProgress.statistics.averageQuizScore = Math.round(avgScore);

    await userProgress.save();
    return userProgress;
  } catch (error) {
    console.error('Error saving quiz submission:', error);
    throw error;
  }
}

/**
 * Award XP for passing a quiz
 */
async function awardQuizXP(userId, moduleId, xpEarned) {
  try {
    const userProgress = await UserProgress.findOne({ userId });
    
    if (!userProgress) {
      throw new Error('User progress not found');
    }

    // Add XP
    userProgress.totalXP += xpEarned;
    
    // Level will be calculated by pre-save hook
    // this.level = Math.floor(this.totalXP / 500) + 1;

    await userProgress.save();
    
    return {
      totalXP: userProgress.totalXP,
      level: userProgress.level,
      xpEarned
    };
  } catch (error) {
    console.error('Error awarding XP:', error);
    throw error;
  }
}

/**
 * Get user's quiz attempts
 */
async function getUserQuizAttempts(userId, limit = 20, offset = 0) {
  try {
    const userProgress = await UserProgress.findOne({ userId });
    
    if (!userProgress) {
      return { data: [], total: 0, passRate: 0 };
    }

    const allAttempts = userProgress.completedModules
      .flatMap(module => 
        (module.quizAttempts || []).map(attempt => ({
          ...attempt,
          moduleId: module.moduleId
        }))
      )
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const passedCount = allAttempts.filter(a => a.passed).length;
    const passRate = allAttempts.length > 0 
      ? Math.round((passedCount / allAttempts.length) * 100)
      : 0;

    const paginatedAttempts = allAttempts.slice(offset, offset + limit);

    return {
      data: paginatedAttempts,
      total: allAttempts.length,
      passRate
    };
  } catch (error) {
    console.error('Error fetching user quiz attempts:', error);
    throw error;
  }
}

/**
 * Get quiz attempts for a specific module
 */
async function getModuleQuizAttempts(userId, moduleId) {
  try {
    const userProgress = await UserProgress.findOne({ userId });
    
    if (!userProgress) {
      return {
        attempts: [],
        bestScore: 0,
        averageScore: 0,
        totalAttempts: 0,
        passed: false,
        currentAttempt: 0
      };
    }

    const completedModule = userProgress.completedModules.find(m => m.moduleId === moduleId);
    
    if (!completedModule || !completedModule.quizAttempts) {
      return {
        attempts: [],
        bestScore: 0,
        averageScore: 0,
        totalAttempts: 0,
        passed: false,
        currentAttempt: 0
      };
    }

    const attempts = completedModule.quizAttempts;
    const bestScore = attempts.length > 0 
      ? Math.max(...attempts.map(a => a.percentage))
      : 0;
    const averageScore = attempts.length > 0
      ? Math.round(attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length)
      : 0;
    const passed = attempts.some(a => a.passed);

    return {
      attempts,
      bestScore,
      averageScore,
      totalAttempts: attempts.length,
      passed,
      currentAttempt: attempts.length + 1
    };
  } catch (error) {
    console.error('Error fetching module quiz attempts:', error);
    throw error;
  }
}

/**
 * Get quiz statistics for a module (for admin/analytics)
 */
async function getModuleQuizStats(moduleId) {
  try {
    // Get all user progress records with this module's quiz attempts
    const allProgress = await UserProgress.find({
      'completedModules.moduleId': moduleId
    });

    let allAttempts = [];
    for (let userProg of allProgress) {
      const module = userProg.completedModules.find(m => m.moduleId === moduleId);
      if (module && module.quizAttempts) {
        allAttempts = [...allAttempts, ...module.quizAttempts];
      }
    }

    const passedCount = allAttempts.filter(a => a.passed).length;
    const passRate = allAttempts.length > 0
      ? Math.round((passedCount / allAttempts.length) * 100)
      : 0;
    const averageScore = allAttempts.length > 0
      ? Math.round(allAttempts.reduce((sum, a) => sum + a.percentage, 0) / allAttempts.length)
      : 0;

    return {
      moduleId,
      totalAttempts: allAttempts.length,
      uniqueUsers: allProgress.length,
      averageScore,
      passRate,
      medianScore: calculateMedian(allAttempts.map(a => a.percentage))
    };
  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    throw error;
  }
}

function calculateMedian(scores) {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

module.exports = {
  getQuizQuestions,
  scoreQuiz,
  saveQuizSubmission,
  awardQuizXP,
  getUserQuizAttempts,
  getModuleQuizAttempts,
  getModuleQuizStats
};
