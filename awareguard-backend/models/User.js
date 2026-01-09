// awareguard-backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String }, // for email/password
    provider: { type: String, default: "local" }, // 'local' or 'google'
    role: { type: String, default: "user" }, // 'user' | 'admin'
    
    // ===== SUBSCRIPTION FIELDS (Added) =====
    
    // Premium subscription status
    isPremium: {
      type: Boolean,
      default: false,
      index: true
    },
    
    // Type of subscription (monthly or annual)
    subscriptionPlan: {
      type: String,
      enum: ['monthly', 'annual', 'none'],
      default: 'none'
    },
    
    // When subscription expires
    subscriptionExpiresAt: {
      type: Date,
      default: null,
      index: true
    },
    
    // When subscription started
    subscriptionStartedAt: {
      type: Date,
      default: null
    },
    
    // Paystack transaction reference
    paystackReference: {
      type: String,
      default: null,
      unique: true,
      sparse: true
    },
    
    // Amount paid in last transaction (Naira)
    lastPaymentAmount: {
      type: Number,
      default: 0
    },
    
    // Payment history for tracking
    paymentHistory: [
      {
        reference: String,
        amount: Number,
        date: { type: Date, default: Date.now },
        status: { type: String, enum: ['success', 'failed', 'cancelled'] },
        plan: String
      }
    ]
  },
  { timestamps: true }
);

// Instance methods for password handling
userSchema.methods.setPassword = async function (plain) {
  const hash = await bcrypt.hash(plain, 10);
  this.passwordHash = hash;
};

userSchema.methods.checkPassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

// ===== HELPER METHODS FOR SUBSCRIPTIONS =====

// Check if subscription is active (not expired)
userSchema.methods.isSubscriptionActive = function () {
  if (!this.isPremium) return false;
  if (!this.subscriptionExpiresAt) return false;
  return new Date() < new Date(this.subscriptionExpiresAt);
};

// Check if subscription is expired
userSchema.methods.isSubscriptionExpired = function () {
  if (!this.subscriptionExpiresAt) return false;
  return new Date() > new Date(this.subscriptionExpiresAt);
};

// Auto-downgrade premium if subscription expired (call this in middleware)
userSchema.methods.checkAndDowngradePremium = function () {
  if (this.isPremium && this.isSubscriptionExpired()) {
    this.isPremium = false;
    this.subscriptionPlan = 'none';
    this.subscriptionExpiresAt = null;
  }
  return this;
};

// Get subscription details
userSchema.methods.getSubscriptionDetails = function () {
  return {
    isPremium: this.isPremium,
    plan: this.subscriptionPlan,
    startsAt: this.subscriptionStartedAt,
    expiresAt: this.subscriptionExpiresAt,
    daysRemaining: this.isPremium && this.subscriptionExpiresAt 
      ? Math.ceil((new Date(this.subscriptionExpiresAt) - new Date()) / (1000 * 60 * 60 * 24))
      : 0,
    lastPayment: this.lastPaymentAmount,
    isActive: this.isSubscriptionActive()
  };
};

// Add a payment to history
userSchema.methods.addPaymentHistory = function (reference, amount, plan, status = 'success') {
  this.paymentHistory.push({
    reference,
    amount,
    plan,
    status,
    date: new Date()
  });
};

// ===== INDEXES FOR PERFORMANCE =====

// Compound index for subscription queries
userSchema.index({ isPremium: 1, subscriptionExpiresAt: 1 });

// ===== MODEL EXPORT =====

export const User = mongoose.model("User", userSchema);
