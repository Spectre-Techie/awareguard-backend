// awareguard-backend/routes/report.js
import express from 'express';
import { Report } from '../models/Report.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/report/report
 * Submit a scam report
 */
router.post('/report', async (req, res) => {
  const { name, email, details } = req.body;

  if (!name || !email || !details) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const report = await Report.create({
      name,
      email,
      details,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.info('New scam report submitted', { reportId: report._id, email });

    res.status(200).json({
      success: true,
      message: 'Report submitted successfully. Our team will review it shortly.',
      reportId: report._id
    });
  } catch (err) {
    logger.error('Report submission failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to submit report. Please try again later.' });
  }
});

export default router;
