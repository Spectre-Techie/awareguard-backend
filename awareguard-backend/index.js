import express from "express";
import cors from "cors";
import { config } from "dotenv";
import askRoute from "./routes/sendMessages.js";
import reportRoute from "./routes/report.js";

// 🔹 NEW IMPORTS
import { connectDB } from "./config/db.js";
import storiesRoute from "./routes/stories.js";

config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// 🔹 CONNECT TO MONGO
connectDB();

// 🔹 EXISTING ROUTES (unchanged)
app.use("/api/report", reportRoute);
app.use("/api/ask", askRoute);

// 🔹 NEW STORIES ROUTE
app.use("/api/stories", storiesRoute);

// 🔹 SIMPLE HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ message: "AwareGuard API running" });
});

app.listen(port, () => {
  console.log(`✅ AwareGuard backend running on http://localhost:${port}`);
});
