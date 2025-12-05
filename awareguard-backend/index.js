// awareguard-backend/index.js
import express from "express";
import cors from "cors";
import { config } from "dotenv";
import askRoute from "./routes/sendMessages.js";  // ✅ Handles /api/ask
import reportRoute from './routes/report.js';     // ✅ Handles /api/report (if that’s what it does)

config(); // ✅ Load env vars from .env file

const app = express();
const port = process.env.PORT || 8000;

// ✅ Middlewares
app.use(cors());
app.use(express.json());

// Add this route to handle the root path
app.get('/', (req, res) => {
  res.json({ 
    status: 'AwareGuard backend is running',
    endpoints: [
      '/api/ask',
      '/api/report'
    ]
  });
});

// ✅ Routes
app.use('/api/report', reportRoute);      // Good: /api/report handled separately
app.use('/api/ask', askRoute);            // Good: directly responds to POST /api/ask

// ✅ Server start
app.listen(port, () => {
  console.log(`✅ AwareGuard backend running on http://localhost:${port}`);
});

