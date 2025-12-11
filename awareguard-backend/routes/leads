// awareguard-backend/routes/leads.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import mongoose from "mongoose";

const router = express.Router();

const leadSchema = new mongoose.Schema({
  name: String,
  email: String,
  organization: String,
  message: String,
  createdAt: { type: Date, default: Date.now },
});

const Lead = mongoose.model("Lead", leadSchema);

// POST /api/leads/upgrade  → public form to capture interest
router.post("/upgrade", async (req, res) => {
  try {
    const { name, email, organization, message } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const lead = await Lead.create({ name, email, organization, message });
    // Optionally notify admin via email here
    res.json({ ok: true, lead });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

// GET /api/leads (admin) -> list leads
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const leads = await Lead.find().sort({ createdAt: -1 }).limit(200);
    res.json({ leads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

export default router;
