// awareguard-backend/routes/learning.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { Progress } from "../models/Progress.js";

const router = express.Router();

/**
 * GET /api/learning/modules
 * Return module list metadata (frontend still can keep modules static).
 * For now we return a minimal JSON clients can use.
 */
router.get("/modules", (req, res) => {
  // Frontend has richer module content. For now return a minimal list; extend as desired.
  const modules = [
    { id: "basics", title: "Online Safety Basics", level: 1, xp: 10, premium: false },
    { id: "job-scam", title: "Job Offer Scam Awareness", level: 2, xp: 15, premium: false },
    { id: "advanced-sim", title: "Advanced Simulations", level: 4, xp: 40, premium: true },
  ];
  res.json({ modules });
});

// GET /api/learning/progress  → get user's saved progress
router.get("/progress", authMiddleware, async (req, res) => {
  try {
    const progress = await Progress.find({ userId: req.user._id }).lean();
    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

// POST /api/learning/progress  → upsert progress for a module
router.post("/progress", authMiddleware, async (req, res) => {
  try {
    const { moduleId, completed = true, xpGained = 0 } = req.body;
    if (!moduleId) return res.status(400).json({ error: "moduleId required" });

    const update = {
      completed,
      xpGained,
      updatedAt: new Date(),
    };

    const progress = await Progress.findOneAndUpdate(
      { userId: req.user._id, moduleId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save progress" });
  }
});

export default router;
