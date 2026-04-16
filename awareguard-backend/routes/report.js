// awareguard-backend/routes/report.js
import express from 'express';
import { Report } from '../models/Report.js';
import logger from '../utils/logger.js';

const router = express.Router();

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeReportPayload(body = {}) {
  const name = sanitizeText(body.name) || 'Anonymous Reporter';
  const email = sanitizeText(body.email).toLowerCase() || 'anonymous@awareguard.local';

  const legacyDetails = sanitizeText(body.details);
  const type = sanitizeText(body.type);
  const url = sanitizeText(body.url);
  const description = sanitizeText(body.description);
  const evidence = sanitizeText(body.evidence);

  let details = legacyDetails;

  if (!details && description) {
    const lines = [];

    if (type) lines.push(`Threat Type: ${type}`);
    if (url) lines.push(`URL: ${url}`);
    lines.push(`Description: ${description}`);
    if (evidence) lines.push(`Evidence: ${evidence}`);

    details = lines.join('\n');
  }

  return { name, email, details };
}

async function submitReport(req, res) {
  const { name, email, details } = normalizeReportPayload(req.body);

  if (!details) {
    return res.status(400).json({ error: 'Report details are required.' });
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
}

/**
 * POST /api/reports
 * Submit a scam report
 */
router.post('/', submitReport);
router.post('/report', submitReport); // Legacy compatibility alias

export default router;
