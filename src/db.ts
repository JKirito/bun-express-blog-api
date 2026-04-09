import mongoose from "mongoose";
import config from "./config/index.ts";

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log(`Connected to MongoDB at ${config.MONGO_URI}`);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
