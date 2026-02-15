// awareguard-backend/routes/sendMessages.js
import express from 'express';
import { chatHelper } from '../utils/OpenAiHelpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required.' });

  try {
    const message = { role: 'user', content: prompt };
    const { content } = await chatHelper(message);
    res.json({ answer: content });
  } catch (err) {
    logger.error('Error processing request', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

export default router;
