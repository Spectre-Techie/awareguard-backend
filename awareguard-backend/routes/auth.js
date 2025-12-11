// awareguard-backend/routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const router = express.Router();

// Create JWT
function createToken(user) {
  return jwt.sign({ sub: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const user = new User({ name, email });
    await user.setPassword(password);
    await user.save();

    const token = createToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// POST /api/auth/signin
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await user.checkPassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = createToken(user);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signin failed" });
  }
});

/*
  Placeholder route for Google Sign-In token verification:
  Client obtains id_token from Google Sign-In and sends here.
  Backend should verify token with Google OAuth2 API (or use google-auth-library).
  For now: a stub returning success; replace with proper verification.
*/
router.post("/google", async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ error: "id_token required" });

    // TODO: verify token with Google: use google-auth-library to verify
    // If valid, get email and name, create or retrieve the user and return JWT.

    // Temporary: return error to remind to implement properly.
    return res.status(501).json({ error: "Google sign-in not configured on backend. See README." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Google signin failed" });
  }
});

export default router;
