import mongoose from "mongoose";

const leadSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    source: {
        type: String,
        default: "website"
    },
    status: {
        type: String,
        enum: ["new", "contacted", "qualified", "lost", "re-interested"],
        default: "new"
    },
    notes: {
        type: String,
        default: ""
    }
}, {
    timestamps: true
});

export const Lead = mongoose.model("Lead", leadSchema);
