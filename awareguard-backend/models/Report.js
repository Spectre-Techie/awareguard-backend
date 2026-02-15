// awareguard-backend/models/Report.js
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        details: { type: String, required: true },

        // Workflow status
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true
        },

        // Admin review tracking
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reviewedAt: Date,
        rejectionReason: String,

        // Link to published story (when approved)
        publishedStoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Story'
        },

        // Metadata
        ipAddress: String,
        userAgent: String
    },
    { timestamps: true }
);

// Indexes for admin queries
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ email: 1 });

export const Report = mongoose.model("Report", reportSchema);
