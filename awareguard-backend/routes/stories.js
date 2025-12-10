import express from "express";
import { Story } from "../models/Story.js";

const router = express.Router();

// POST /api/stories/submit  → create story
router.post("/submit", async (req, res) => {
  try {
    const { name, title, category, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content required" });
    }

    const story = await Story.create({
      name,
      title,
      category,
      content,
    });

    res.status(201).json({ message: "Story submitted", story });
  } catch (error) {
    console.error("❌ Submit story failed:", error);
    res.status(500).json({ error: "Failed to submit story" });
  }
});

// GET /api/stories  → list stories
router.get("/", async (req, res) => {
  try {
    const stories = await Story.find().sort({ createdAt: -1 }).limit(50);
    res.json({ stories });
  } catch (error) {
    console.error("❌ Fetch stories failed:", error);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
});

// POST /api/stories/:id/like  → like a story
router.post("/:id/like", async (req, res) => {
  try {
    const { id } = req.params;

    const story = await Story.findByIdAndUpdate(
      id,
      { $inc: { likesCount: 1 } },
      { new: true }
    );

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    res.json({ likesCount: story.likesCount });
  } catch (error) {
    console.error("❌ Like story failed:", error);
    res.status(500).json({ error: "Failed to like story" });
  }
});

// POST /api/stories/:id/comment  → add comment
router.post("/:id/comment", async (req, res) => {
  try {
    const { id } = req.params;
    const { text, name } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Comment cannot be empty" });
    }

    const story = await Story.findByIdAndUpdate(
      id,
      { $push: { comments: { name, text } } },
      { new: true }
    );

    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    res.json({ comments: story.comments });
  } catch (error) {
    console.error("❌ Add comment failed:", error);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

export default router;
