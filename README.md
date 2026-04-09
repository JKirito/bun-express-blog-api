# Bun + Express Blog API

A production-structured REST API for blog post management built with **Bun**, **Express v5**, **MongoDB** (via Mongoose), and **TypeScript**. Built iteratively to demonstrate real architectural patterns: layered architecture, validation, error handling, versioning, rate limiting, and behavioral integration testing.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
  - [Response Envelope](#response-envelope)
  - [Utility Routes](#utility-routes)
  - [Posts Routes](#posts-routes)
- [Architecture](#architecture)
  - [Middleware Stack](#middleware-stack)
  - [Layer Responsibilities](#layer-responsibilities)
  - [Error Handling](#error-handling)
  - [Post Publishing Workflow](#post-publishing-workflow)
  - [Versioning System](#versioning-system)
- [Testing](#testing)
  - [Test Strategy](#test-strategy)
  - [Running Tests](#running-tests)
  - [Test Infrastructure](#test-infrastructure)

---

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Bun](https://bun.sh) | latest | Runtime, package manager, test runner |
| [Express](https://expressjs.com) | v5 | HTTP framework (async-safe without `express-async-errors`) |
| [MongoDB](https://www.mongodb.com) | 7 (Docker) | Database |
| [Mongoose](https://mongoosejs.com) | ^9 | ODM |
| [Zod](https://zod.dev) | v4 | Schema validation (env config + request bodies) |
| [TypeScript](https://www.typescriptlang.org) | ^5 | Strict mode (`noUncheckedIndexedAccess`) |

---

## Project Structure

```
bun_testing_code/
├── src/
│   ├── config/
│   │   └── index.ts          # Env var validation with Zod (fails fast at startup)
│   ├── errors/
│   │   └── index.ts          # AppError, NotFoundError, BadRequestError, ConflictError
│   ├── middleware/
│   │   ├── errorHandler.ts   # Global error handler + 404 catch-all
│   │   ├── rateLimiter.ts    # 100 req/IP/min in-memory rate limiter
│   │   ├── requestCounter.ts # Per-endpoint request counter (for GET /metrics)
│   │   └── validate.ts       # Reusable Zod validation middleware factory
│   ├── models/
│   │   ├── post.ts           # Post schema (title, content, author, status, tags, currentVersion)
│   │   └── postVersion.ts    # PostVersion schema (separate collection for edit history)
│   ├── routes/
│   │   ├── index.ts          # GET /, GET /health, POST /echo, GET /metrics
│   │   └── posts.ts          # Full posts CRUD + publish + history + rollback
│   ├── schemas/
│   │   └── post.ts           # Zod schemas for createPost and updatePost
│   ├── services/
│   │   ├── post.service.ts   # Business logic: getPublishedPosts, publishPost, updatePost
│   │   └── version.service.ts # saveVersion, getHistory, rollbackPost, pruneOldVersions
│   ├── utils/
│   │   └── response.ts       # sendSuccess() and sendError() envelope helpers
│   ├── app.ts                # Express app setup (exported for testing)
│   ├── db.ts                 # Mongoose connect/disconnect
│   └── server.ts             # Entry point: connects DB then starts listening
├── tests/
│   ├── setup.ts              # Shared server lifecycle, getBaseUrl(), json<T>() helper
│   ├── app.test.ts           # Tests for utility routes, rate limiting, metrics
│   └── posts.test.ts         # Tests for all posts endpoints + versioning
├── docker-compose.yml        # MongoDB 7 container
├── package.json
└── tsconfig.json
```

---

## Getting Started

**Prerequisites:** [Bun](https://bun.sh) and [Docker](https://www.docker.com) installed.

```bash
# 1. Install dependencies
bun install

# 2. Start MongoDB
docker compose up -d

# 3. Start the dev server (hot reload)
bun run dev
```

The server starts at `http://localhost:3000`.

```bash
# Run all tests
bun test

# Start in production mode
bun run start
```

---

## Environment Variables

All variables are validated at startup using Zod. The app exits immediately with a clear error if any value is invalid.

| Variable | Default | Validation |
|---|---|---|
| `NODE_ENV` | `development` | `"development" \| "production" \| "test"` |
| `PORT` | `3000` | Positive integer |
| `MONGO_URI` | `mongodb://localhost:27017/bun_app` | Valid URL format |

---

## API Reference

### Response Envelope

Every response uses a consistent envelope shape:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Human-readable description",
    "errors": [
      { "field": "title", "message": "title is required" }
    ]
  }
}
```

`errors[]` is only present on validation failures (400). `DELETE` returns `204 No Content` with no body.

---

### Utility Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health ping |
| `GET` | `/health` | Service health check |
| `POST` | `/echo` | Echoes back the request JSON body |
| `GET` | `/metrics` | Request counts per endpoint, sorted by most-used |

---

### Posts Routes

#### `GET /posts`

Returns all **published** posts, newest first. Optionally filter by tag.

**Query params:** `?tag=javascript` (case-insensitive)

**Response:** `200 { success: true, data: Post[] }`

---

#### `GET /posts/tags`

Returns the top 10 most-used tags across all published posts.

**Response:** `200 { success: true, data: [{ tag: string, count: number }] }`

---

#### `GET /posts/:id`

Returns a single post by ID (any status).

**Response:** `200 { success: true, data: Post }` | `404` | `400` (invalid ObjectId)

---

#### `POST /posts`

Creates a post. All new posts start with `status: "draft"`.

**Body:**
```json
{
  "title": "string (1–200 chars, required)",
  "content": "string (min 1 char, required)",
  "author": "string (1–100 chars, required)",
  "tags": ["string"]
}
```

Tags are optional. Each tag: max 50 chars, max 10 tags per post. Auto-lowercased and deduplicated.

**Response:** `201 { success: true, data: Post }` | `400` (validation errors)

---

#### `PATCH /posts/:id`

Partially updates a post. All fields are optional. Creates a version snapshot of the pre-edit state.

**Body:** Same fields as `POST /posts`, all optional.

**Response:** `200 { success: true, data: Post }` | `400` | `404`

---

#### `PATCH /posts/:id/publish`

Publishes a draft post. Business rules:
- Content must be at least **50 characters**
- Post must not already be published

**Response:** `200 { success: true, data: Post }` | `400` (too short) | `404` | `409` (already published)

---

#### `PATCH /posts/:id/rollback/:version`

Restores a post to a previous version. The rollback itself is versioned (so it can be undone). Published status is preserved.

**Constraints:** `version` must be >= 1 (cannot rollback to version 0).

**Response:** `200 { success: true, data: Post }` | `400` | `404`

---

#### `GET /posts/:id/history`

Returns all version snapshots for a post, newest first.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "version": 3,
      "snapshot": { "title": "...", "content": "...", "author": "...", "tags": [] },
      "changedFields": ["title"],
      "changedAt": "2026-04-09T..."
    }
  ]
}
```

---

#### `DELETE /posts/:id`

Permanently deletes a post.

**Response:** `204 No Content` | `404`

---

## Architecture

### Middleware Stack

Requests flow through this stack in order (defined in `src/app.ts`):

```
express.json()      -> parse request body (400 on malformed JSON)
rateLimiter         -> 100 req/IP/min; 429 + Retry-After header on breach
requestCounter      -> tallies METHOD /path for GET /metrics
routes              -> GET /, /health, /echo, /metrics
postsRouter         -> all /posts endpoints
notFoundHandler     -> 404 catch-all for unmatched routes
errorHandler        -> global 4-arg Express error handler (must be last)
```

---

### Layer Responsibilities

| Layer | What it does | What it does NOT do |
|---|---|---|
| **Route handler** | Parse HTTP request params/query, call service, send response | Business logic, DB queries |
| **Zod schema** | Validate and transform input shape (lowercase tags, dedup, type checks) | Business rules |
| **Service** | Enforce business rules, orchestrate DB operations | Know about HTTP (no `req`/`res`) |
| **Model** | Define DB schema, enforce data types and defaults | Business logic |
| **Error middleware** | Translate thrown errors into HTTP responses | Route-specific behavior |

Services throw typed `AppError` subclasses. Route handlers have no `try/catch` -- Express v5 automatically propagates async rejections to the error handler.

---

### Error Handling

| Error Type | Source | HTTP Status |
|---|---|---|
| `NotFoundError` | Service (post/version not found) | 404 |
| `BadRequestError` | Service (business rule violation) | 400 |
| `ConflictError` | Service (e.g., already published) | 409 |
| `CastError` | Mongoose (invalid ObjectId) | 400 |
| `SyntaxError` | `express.json()` (malformed body) | 400 |
| Unknown route | No route matched | 404 |
| Unhandled exception | Anything else | 500 |

All errors are returned in the standard response envelope.

---

### Post Publishing Workflow

Posts follow a strict lifecycle:

```
POST /posts -> status: "draft"
                  |
PATCH /posts/:id/publish  (content must be >= 50 chars)
                  |
           status: "published"
```

- `GET /posts` returns **only published** posts
- Clients cannot set `status` directly -- Zod strips unknown fields

---

### Versioning System

Every `PATCH /posts/:id` edit creates a version snapshot **before** the edit is applied. Versions are stored in a separate `PostVersion` collection (not embedded in the post document) to keep post reads lean.

Key behaviors:

- **Version 0** is the original creation -- cannot be rolled back to
- **Rollback is itself versioned** -- rolling back creates a new version entry, so the rollback can be undone
- **Published status is preserved** during rollback (only content fields change)
- **50-version cap** -- oldest versions are pruned automatically when the cap is exceeded
- **Separate collection** -- `PostVersion` documents keep post reads lean; history is only loaded on demand

---

## Testing

### Test Strategy

The test suite uses **behavioral / black-box integration testing**. Every test:

- Starts a real Express server on a random port
- Connects to a real MongoDB test database
- Sends real HTTP requests using `fetch`
- Asserts on status codes, response headers, and response body shapes

No mocks, no stubs, no Express internals. Tests exercise the full request lifecycle: routing -> middleware -> validation -> service -> database -> serialization.

**73 tests across 2 files, 212 assertions.**

### Running Tests

```bash
# Start MongoDB first
docker compose up -d

# Run all tests
bun test
```

### Test Infrastructure

**`tests/setup.ts`** provides shared infrastructure for all test files:

- **`setupTestServer()`** -- called at the top of each test file. Starts the server on a random port (`app.listen(0)`) and connects to the test database. Safe to call multiple times (guarded against duplicate initialization).
- **`getBaseUrl()`** -- returns the ephemeral base URL (e.g., `http://localhost:54321`).
- **`json<T>(res)`** -- typed wrapper around `res.json()`. Avoids `unknown` type errors under strict TypeScript without using `any`. The `fetch` API returns `Promise<unknown>` from `.json()` -- this helper centralizes the type assertion in one place so call sites stay clean.
- **Process `beforeExit` hook** -- drops the test database and disconnects Mongoose after all test files complete.

**Rate limiter and counter isolation:** Both in-memory stores export `reset*()` functions that `beforeEach` calls to prevent cross-test contamination.
