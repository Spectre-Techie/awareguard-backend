import mongoose from "mongoose";

const storySchema = new mongoose.Schema(
  {
    name: { type: String, default: "Anonymous" },
    title: { type: String, required: true },
    category: { type: String, default: "General" },
    content: { type: String, required: true },
    likesCount: { type: Number, default: 0 },
    comments: [
      {
        name: { type: String, default: "Anonymous" },
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const Story = mongoose.model("Story", storySchema);
