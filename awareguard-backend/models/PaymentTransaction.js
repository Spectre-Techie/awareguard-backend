// awareguard-backend/models/PaymentTransaction.js
import mongoose from "mongoose";

const paymentTransactionSchema = new mongoose.Schema(
    {
        reference: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        amount: { type: Number, required: true },
        plan: {
            type: String,
            enum: ['monthly', 'annual'],
            required: true
        },
        status: {
            type: String,
            enum: ['success', 'failed', 'cancelled'],
            default: 'success'
        },
        source: {
            type: String,
            enum: ['verify', 'webhook'],
            required: true
        },
        processedAt: { type: Date, default: Date.now },

        // Additional metadata
        paystackData: mongoose.Schema.Types.Mixed
    },
    { timestamps: true }
);

// Compound indexes for admin queries
paymentTransactionSchema.index({ userId: 1, createdAt: -1 });
paymentTransactionSchema.index({ status: 1, createdAt: -1 });

export const PaymentTransaction = mongoose.model("PaymentTransaction", paymentTransactionSchema);
