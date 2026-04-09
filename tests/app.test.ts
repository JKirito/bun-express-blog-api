import { describe, test, expect, beforeEach } from "bun:test";
import { setupTestServer, getBaseUrl, json } from "./setup.ts";
import { resetRateLimitStore } from "../src/middleware/rateLimiter.ts";
import { resetRequestCounts } from "../src/middleware/requestCounter.ts";

setupTestServer();

beforeEach(() => {
  resetRateLimitStore();
  resetRequestCounts();
});

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

describe("Rate limiting", () => {
  test("allows requests within the limit", async () => {
    const res = await fetch(`${getBaseUrl()}/health`);
    expect(res.status).toBe(200);
  });

  test("returns 429 when rate limit exceeded", async () => {
    // Send 100 requests to exhaust the limit
    const requests = Array.from({ length: 100 }, () =>
      fetch(`${getBaseUrl()}/health`)
    );
    await Promise.all(requests);

    // 101st request should be blocked
    const res = await fetch(`${getBaseUrl()}/health`);
    expect(res.status).toBe(429);
    const data = await json(res);
    expect(data.success).toBe(false);
    expect(data.error.message).toContain("Too many requests");
  });

  test("includes Retry-After header on 429", async () => {
    const requests = Array.from({ length: 100 }, () =>
      fetch(`${getBaseUrl()}/health`)
    );
    await Promise.all(requests);

    const res = await fetch(`${getBaseUrl()}/health`);
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("retry-after");
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
  });
});

describe("GET /metrics", () => {
  test("returns request counts in envelope", async () => {
    // Make some requests to different endpoints
    await fetch(`${getBaseUrl()}/health`);
    await fetch(`${getBaseUrl()}/health`);
    await fetch(`${getBaseUrl()}/`);

    const res = await fetch(`${getBaseUrl()}/metrics`);
    expect(res.status).toBe(200);
    const data = await json<{ success: true; data: { endpoint: string; count: number }[] }>(res);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    const healthEntry = data.data.find((e) => e.endpoint === "GET /health");
    expect(healthEntry).toBeDefined();
    expect(healthEntry!.count).toBe(2);
  });

  test("sorts endpoints by count descending", async () => {
    await fetch(`${getBaseUrl()}/health`);
    await fetch(`${getBaseUrl()}/`);
    await fetch(`${getBaseUrl()}/`);
    await fetch(`${getBaseUrl()}/`);

    const res = await fetch(`${getBaseUrl()}/metrics`);
    const data = await json<{ success: true; data: { endpoint: string; count: number }[] }>(res);

    // Filter out the /metrics request itself
    const nonMetrics = data.data.filter((e) => e.endpoint !== "GET /metrics");
    expect(nonMetrics[0]!.endpoint).toBe("GET /");
    expect(nonMetrics[0]!.count).toBe(3);
    expect(nonMetrics[1]!.endpoint).toBe("GET /health");
    expect(nonMetrics[1]!.count).toBe(1);
  });

  test("returns empty array when no requests have been made", async () => {
    const res = await fetch(`${getBaseUrl()}/metrics`);
    expect(res.status).toBe(200);
    const data = await json<{ success: true; data: { endpoint: string; count: number }[] }>(res);
    // Only the /metrics request itself should be counted
    expect(data.data).toHaveLength(1);
    expect(data.data[0]!.endpoint).toBe("GET /metrics");
  });
});
