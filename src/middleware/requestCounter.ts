import type { Request, Response, NextFunction } from "express";

const counts = new Map<string, number>();

export function requestCounter(req: Request, _res: Response, next: NextFunction): void {
  // Normalize path: collapse :id-like segments so /posts/abc123 and /posts/def456
  // both count as "GET /posts/:id" instead of creating unique entries per ID.
  const path = req.path.replace(/\/[a-f0-9]{24}/g, "/:id");
  const key = `${req.method} ${path}`;

  counts.set(key, (counts.get(key) ?? 0) + 1);

  next();
}

export function getRequestCounts(): { endpoint: string; count: number }[] {
  return Array.from(counts.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count);
}

/** Reset the request counts. Used in tests. */
export function resetRequestCounts(): void {
  counts.clear();
}
