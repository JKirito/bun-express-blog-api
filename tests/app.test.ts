import { describe, test, expect } from "bun:test";
import { setupTestServer, getBaseUrl, json } from "./setup.ts";

setupTestServer();

describe("GET /", () => {
  test("returns 200 status", async () => {
    const res = await fetch(`${getBaseUrl()}/`);
    expect(res.status).toBe(200);
  });

  test("returns correct JSON message in envelope", async () => {
    const res = await fetch(`${getBaseUrl()}/`);
    const data = await json(res);
    expect(data).toEqual({
      success: true,
      data: { message: "Hello from Bun + Express!" },
    });
  });

  test("returns content-type application/json", async () => {
    const res = await fetch(`${getBaseUrl()}/`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /health", () => {
  test("returns 200 status", async () => {
    const res = await fetch(`${getBaseUrl()}/health`);
    expect(res.status).toBe(200);
  });

  test("returns ok status in body", async () => {
    const res = await fetch(`${getBaseUrl()}/health`);
    const data = await json(res);
    expect(data).toEqual({
      success: true,
      data: { status: "ok" },
    });
  });
});

describe("POST /echo", () => {
  test("returns 200 and echoes JSON body", async () => {
    const body = { hello: "world", num: 42 };
    const res = await fetch(`${getBaseUrl()}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({ echo: body });
  });

  test("echoes nested JSON correctly", async () => {
    const body = { user: { name: "Alice", tags: ["admin", "editor"] } };
    const res = await fetch(`${getBaseUrl()}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await json(res);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({ echo: body });
  });

  test("returns empty echo when no body is sent", async () => {
    const res = await fetch(`${getBaseUrl()}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.success).toBe(true);
    expect(data.data).toEqual({ echo: {} });
  });
});

describe("Invalid JSON", () => {
  test("returns 400 with JSON error envelope for malformed body", async () => {
    const res = await fetch(`${getBaseUrl()}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.success).toBe(false);
    expect(data.error.message).toBe("Malformed JSON in request body");
  });
});

describe("Method not allowed", () => {
  test("DELETE on / returns 404 with JSON error envelope", async () => {
    const res = await fetch(`${getBaseUrl()}/`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data).toEqual({ success: false, error: { message: "Not found" } });
  });

  test("PUT on /health returns 404 with JSON error envelope", async () => {
    const res = await fetch(`${getBaseUrl()}/health`, { method: "PUT" });
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.success).toBe(false);
  });

  test("GET on /echo returns 404 with JSON error envelope", async () => {
    const res = await fetch(`${getBaseUrl()}/echo`, { method: "GET" });
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.success).toBe(false);
  });
});

describe("Unknown routes", () => {
  test("returns 404 with JSON error envelope for unknown path", async () => {
    const res = await fetch(`${getBaseUrl()}/nonexistent`);
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data).toEqual({ success: false, error: { message: "Not found" } });
  });
});
