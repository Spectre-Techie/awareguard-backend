// awareguard-backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String }, // for email/password
  provider: { type: String, default: "local" }, // 'local' or 'google'
  createdAt: { type: Date, default: Date.now },
  role: { type: String, default: "user" } // 'user' | 'admin'
});

userSchema.methods.setPassword = async function (plain) {
  const hash = await bcrypt.hash(plain, 10);
  this.passwordHash = hash;
};

userSchema.methods.checkPassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model("User", userSchema);
