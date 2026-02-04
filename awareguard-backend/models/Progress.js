// awareguard-backend/models/Progress.js
// NOTE: This model is currently UNUSED - UserProgress.js is used instead
// This file is kept for backward compatibility but should be considered for removal
// See UserProgress.js for the actively used progress tracking model
import mongoose from "mongoose";

const progressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  moduleId: { type: String, required: true },
  completed: { type: Boolean, default: false },
  xpGained: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

progressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

export const Progress = mongoose.model("Progress", progressSchema);
