/**
 * Quiz.js - MongoDB Schema for Quiz Questions and Answers
 * Location: awareguard-backend/models/Quiz.js
 * 
 * This schema stores all quiz questions and correct answers.
 * Used by quizzes.js routes to serve questions and validate answers.
 */

const mongoose = require('mongoose');

const quizAnswerSchema = new mongoose.Schema({
  optionIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 3
  },
  answerText: {
    type: String,
    required: true
  }
});

const quizQuestionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true,
    unique: true
  },
  moduleId: {
    type: String,
    required: true,
    index: true
  },
  questionText: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['mcq', 'scenario', 'true-false'],
    default: 'mcq'
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  options: [
    {
      index: Number,
      text: String
    }
  ],
  correctAnswer: {
    type: Number, // Index of correct option (0, 1, 2, or 3)
    required: true,
    min: 0,
    max: 3
  },
  explanation: {
    type: String,
    description: "Explanation shown after answer"
  },
  correctExplanation: {
    type: String,
    description: "Why the correct answer is right"
  },
  incorrectExplanations: [
    {
      optionIndex: Number,
      explanation: String
    }
  ],
  points: {
    type: Number,
    default: 10,
    min: 1,
    max: 50
  },
  category: {
    type: String,
    index: true
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

// Index for quick lookups
quizQuestionSchema.index({ moduleId: 1, type: 1 });

module.exports = mongoose.model('Quiz', quizQuestionSchema);
