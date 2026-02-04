import express from "express";
import cors from "cors";
import { config } from "dotenv";
import askRoute from "./routes/sendMessages.js";
import reportRoute from "./routes/report.js";
import authRoute from "./routes/auth.js";
import learningRoute from "./routes/learning.js";
import leadsRoute from "./routes/leads.js";
import paymentRoute from "./routes/payments.js";

// 🔹 NEW IMPORTS
import { connectDB } from "./config/db.js";
import storiesRoute from "./routes/stories.js";
import quizzesRoute from "./routes/api/quizzes.js";
import configRoute from "./routes/config.js";
import contactRoute from "./routes/contact.js";

config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// 🔹 CONNECT TO MONGO
connectDB();

app.post('/api/payments/webhook', express.json(), paymentRoute);

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

// 🔹 SIMPLE HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ message: "AwareGuard API running" });
});


app.listen(port, () => {
  console.log(`✅ AwareGuard backend running on http://localhost:${port}`);
});



