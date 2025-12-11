// awareguard-backend/models/Progress.js
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
