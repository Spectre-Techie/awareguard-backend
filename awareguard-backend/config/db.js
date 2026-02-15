import mongoose from "mongoose";
import logger from "../utils/logger.js";

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "awareguard",
    });
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection failed", { error: error.message });
  }
}
