import { afterAll, beforeAll } from "bun:test";
import mongoose from "mongoose";
import app from "../src/app.ts";

const TEST_MONGO_URI = process.env["MONGO_URI"] || "mongodb://localhost:27017/bun_app_test";

let baseUrl = "";
let server: ReturnType<typeof app.listen> | null = null;
let connected = false;

/**
 * Call this in each test file to ensure the server and DB are ready.
 * Safe to call multiple times -- it only sets up once.
 */
export function setupTestServer(): void {
  beforeAll(async () => {
    if (!connected) {
      await mongoose.connect(TEST_MONGO_URI);
      connected = true;
    }
    if (!server) {
      server = app.listen(0);
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        baseUrl = `http://localhost:${address.port}`;
      }
    }
  });

  afterAll(async () => {
    // Each file cleans up its own collections but keeps the connection alive.
    // Mongoose and the server will be cleaned up on process exit.
  });
}

export function getBaseUrl(): string {
  return baseUrl;
}

// Global cleanup when the process exits
process.on("beforeExit", async () => {
  if (server) server.close();
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
