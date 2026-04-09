import { describe, test, expect } from "bun:test";
import app from "../src/app.ts";

/**
 * Helper: make a request against the Express app without starting a live server.
 * Bun can drive an Express app through its built-in fetch by spinning up an
 * ephemeral server for each test suite.
 */
let baseUrl: string;
let server: ReturnType<typeof app.listen>;

// Start the app on a random available port before tests run
describe("Express App", () => {
  // Setup: start server on random port
  test("server starts", async () => {
    server = app.listen(0); // 0 = OS picks a free port
    const address = server.address();
    if (typeof address === "object" && address !== null) {
      baseUrl = `http://localhost:${address.port}`;
    }
    expect(baseUrl).toBeDefined();
  });

  describe("GET /", () => {
    test("returns 200 status", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
    });

    test("returns correct JSON message", async () => {
      const res = await fetch(`${baseUrl}/`);
      const data = await res.json();
      expect(data).toEqual({ message: "Hello from Bun + Express!" });
    });

    test("returns content-type application/json", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("GET /health", () => {
    test("returns 200 status", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
    });

    test("returns ok status in body", async () => {
      const res = await fetch(`${baseUrl}/health`);
      const data = await res.json();
      expect(data).toEqual({ status: "ok" });
    });
  });

  describe("POST /echo", () => {
    test("returns 200 and echoes JSON body", async () => {
      const body = { hello: "world", num: 42 };
      const res = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ echo: body });
    });

    test("echoes nested JSON correctly", async () => {
      const body = { user: { name: "Alice", tags: ["admin", "editor"] } };
      const res = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      expect(data).toEqual({ echo: body });
    });

    test("returns empty echo when no body is sent", async () => {
      const res = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ echo: {} });
    });
  });

  describe("Invalid JSON", () => {
    test("returns 400 for malformed JSON body", async () => {
      const res = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Method not allowed", () => {
    test("DELETE on / returns 404", async () => {
      const res = await fetch(`${baseUrl}/`, { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    test("PUT on /health returns 404", async () => {
      const res = await fetch(`${baseUrl}/health`, { method: "PUT" });
      expect(res.status).toBe(404);
    });

    test("GET on /echo returns 404", async () => {
      const res = await fetch(`${baseUrl}/echo`, { method: "GET" });
      expect(res.status).toBe(404);
    });
  });

  describe("Unknown routes", () => {
    test("returns 404 for unknown path", async () => {
      const res = await fetch(`${baseUrl}/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  // Teardown: close server after all tests
  test("server closes", () => {
    server.close();
  });
});
