/**
 * validateQuiz.js - Middleware for Quiz Validation
 * Location: awareguard-backend/middleware/validateQuiz.js
 * 
 * Validates quiz submission data
 */

const validateQuiz = (req, res, next) => {
  const { moduleId, answers, timeSpentSeconds } = req.body;

  // Validate moduleId
  if (!moduleId || typeof moduleId !== 'string') {
    return res.status(400).json({
      message: 'Invalid moduleId. Must be a non-empty string.',
      status: 'validation_error'
    });
  }

  // Validate answers array
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({
      message: 'Invalid answers. Must be a non-empty array.',
      status: 'validation_error'
    });
  }

  // Validate each answer
  for (let answer of answers) {
    if (!answer.questionId || typeof answer.questionId !== 'string') {
      return res.status(400).json({
        message: 'Invalid questionId in answers.',
        status: 'validation_error'
      });
    }

    if (!Number.isInteger(answer.selectedOption) || answer.selectedOption < 0 || answer.selectedOption > 3) {
      return res.status(400).json({
        message: 'Invalid selectedOption. Must be 0-3.',
        status: 'validation_error'
      });
    }
  }

  // Validate timeSpentSeconds (optional but if provided must be valid)
  if (timeSpentSeconds !== undefined && (!Number.isInteger(timeSpentSeconds) || timeSpentSeconds < 0)) {
    return res.status(400).json({
      message: 'Invalid timeSpentSeconds. Must be a non-negative integer.',
      status: 'validation_error'
    });
  }

  next();
};

module.exports = validateQuiz;
