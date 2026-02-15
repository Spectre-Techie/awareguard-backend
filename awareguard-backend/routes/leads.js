import express from "express";
import { Lead } from "../models/Lead.js";
import { authMiddleware } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = express.Router();

// POST /api/leads/interested - User clicked "Upgrade to Premium"
router.post("/interested", authMiddleware, async (req, res) => {
  try {
    // Check if duplicate
    const userId = req.user._id;
    const existing = await Lead.findOne({ userId });

    if (existing) {
      // Just update timestamp
      existing.updatedAt = new Date();
      existing.status = "re-interested";
      await existing.save();
      return res.json({ message: "Interest noted again!" });
    }

    // Create new lead
    const lead = await Lead.create({
      userId,
      email: req.user.email,
      name: req.user.name,
      source: "upgrade_button",
      status: "new"
    });

    res.status(201).json({ message: "Interest recorded", lead });
  } catch (error) {
    logger.error("Error recording lead", { error: error.message, stack: error.stack });
    res.status(500).json({ error: "Failed to record interest" });
  }
});

// GET /api/leads - Admin only (protected)
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Add admin check here ideally
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    logger.error("Error fetching leads", { error: error.message, stack: error.stack });
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

export default router;
