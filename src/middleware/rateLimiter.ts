import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.ts";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = 100;
const WINDOW_MS = 60 * 1000; // 1 minute

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now >= entry.resetTime) {
      store.delete(ip);
    }
  }
}, WINDOW_MS);

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();

  let entry = store.get(ip);

  if (!entry || now >= entry.resetTime) {
    entry = { count: 0, resetTime: now + WINDOW_MS };
    store.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.setHeader("Retry-After", retryAfter);
    sendError(res, "Too many requests, please try again later", 429);
    return;
  }

  next();
}

/** Reset the rate limit store. Used in tests. */
export function resetRateLimitStore(): void {
  store.clear();
}
