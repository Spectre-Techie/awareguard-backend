/**
 * UserProgress.js - MongoDB Schema for User Learning Progress
 * Location: awareguard-backend/models/UserProgress.js
 * 
 * Tracks user's learning journey: completed modules, quiz scores, XP, streaks
 * Enhanced to support quiz tracking and detailed progress metrics
 */

import mongoose from 'mongoose';

const completedLessonSchema = new mongoose.Schema({
  lessonId: String,
  completedAt: Date,
  timeSpentSeconds: Number
});

const quizSubmissionSchema = new mongoose.Schema({
  quizId: String,
  moduleId: String,
  submittedAt: Date,
  score: Number,
  percentage: Number,
  passed: Boolean,
  timeSpentSeconds: Number,
  answers: [
    {
      questionId: String,
      selectedOption: Number,
      correct: Boolean,
      points: Number
    }
  ]
});

const completedModuleSchema = new mongoose.Schema({
  moduleId: {
    type: String,
    required: true
  },
  title: String,
  category: String,
  completedAt: {
    type: Date,
    default: Date.now
  },
  xpEarned: {
    type: Number,
    default: 0
  },
  lessonsCompleted: [completedLessonSchema],
  quizAttempts: [quizSubmissionSchema],
  totalTimeMinutes: Number
});

const userProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  totalXP: {
    type: Number,
    default: 0,
    min: 0
  },
  level: {
    type: Number,
    default: 1,
    min: 1
  },
  currentStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  longestStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActiveDate: Date,
  joinedDate: {
    type: Date,
    default: Date.now
  },
  completedModules: [completedModuleSchema],
  inProgressModule: {
    moduleId: String,
    startedAt: Date,
    currentLessonIndex: Number
  },
  achievements: [
    {
      achievementId: String,
      unlockedAt: Date,
      type: String // modules, streak, level, path
    }
  ],
  learningPaths: [
    {
      pathId: String,
      startedAt: Date,
      completionPercentage: Number,
      modulesCompleted: Number,
      totalXPEarned: Number
    }
  ],
  statistics: {
    totalLessonsCompleted: {
      type: Number,
      default: 0
    },
    totalQuizzesAttempted: {
      type: Number,
      default: 0
    },
    totalQuizzesPass: {
      type: Number,
      default: 0
    },
    averageQuizScore: {
      type: Number,
      default: 0
    },
    totalMinutesLearned: {
      type: Number,
      default: 0
    },
    lastLessonCompletedAt: Date,
    lastQuizCompletedAt: Date
  },
  preferences: {
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'mixed'],
      default: 'mixed'
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    marketingEmails: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
userProgressSchema.index({ userId: 1 });
userProgressSchema.index({ totalXP: -1 }); // For leaderboards
userProgressSchema.index({ level: -1 });
userProgressSchema.index({ 'completedModules.completedAt': -1 });

// Pre-save hook to calculate level from XP
userProgressSchema.pre('save', function (next) {
  // Level = floor(totalXP / 500) + 1
  this.level = Math.floor(this.totalXP / 500) + 1;
  this.updatedAt = new Date();
  next();
});

export const UserProgress = mongoose.model('UserProgress', userProgressSchema);
