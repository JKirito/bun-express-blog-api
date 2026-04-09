import mongoose from "mongoose";

const MONGO_URI = process.env["MONGO_URI"] || "mongodb://localhost:27017/bun_app";

export async function connectDB(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB at ${MONGO_URI}`);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
