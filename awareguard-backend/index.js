import express from "express";
import cors from "cors";
import { config } from "dotenv";
import askRoute from "./routes/sendMessages.js";
import reportRoute from "./routes/report.js";
import authRoute from "./routes/auth.js";
import learningRoute from "./routes/learning.js";
import leadsRoute from "./routes/leads.js";
import paymentRoute from "./routes/payments.js";
import adminRoute from "./routes/admin.js";
import logger from "./utils/logger.js";

// 🔹 NEW IMPORTS
import { connectDB } from "./config/db.js";
import storiesRoute from "./routes/stories.js";
import quizzesRoute from "./routes/api/quizzes.js";
import configRoute from "./routes/config.js";
import contactRoute from "./routes/contact.js";

config();

const app = express();
const port = process.env.PORT || 8000;

// ===== CORS LOCKDOWN =====
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    logger.warn('CORS: blocked origin', { origin });
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

// ===== RAW BODY FOR WEBHOOK SIGNATURE VERIFICATION =====
// MUST come before express.json() to preserve raw bytes
app.post('/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentRoute
);

app.use(express.json());

// 🔹 CONNECT TO MONGO
connectDB();

// 🔹 EXISTING ROUTES (unchanged)
app.use("/api/report", reportRoute);
app.use("/api/ask", askRoute);

//New Routes
app.use("/api/auth", authRoute);
app.use("/api/learning", learningRoute);
app.use("/api/leads", leadsRoute);
// Payment routes
app.use("/api/payments", paymentRoute);

// 🔹 NEW STORIES ROUTE
app.use("/api/stories", storiesRoute);

// 🔹 QUIZ ROUTES
app.use("/api/quizzes", quizzesRoute);

// 🔹 CONFIG ROUTES (for frontend)
app.use("/api/config", configRoute);

// 🔹 CONTACT ROUTES
app.use("/api/contact", contactRoute);

// 🔹 ADMIN ROUTES
app.use("/api/admin", adminRoute);

// 🔹 SIMPLE HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ message: "AwareGuard API running" });
});


app.listen(port, () => {
  logger.info(`AwareGuard backend running on http://localhost:${port}`);
});




