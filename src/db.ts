import mongoose from "mongoose";

const MONGO_URI = process.env["MONGO_URI"] || "mongodb://localhost:27017/bun_app";

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected to MongoDB at ${MONGO_URI}`);
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
