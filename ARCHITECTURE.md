# Architecture & Engineering Principles

This document defines the architectural boundaries, layer responsibilities, and engineering principles for building production Node/Bun REST APIs. It is intended as a reference for consistent decision-making across any project — not tied to any specific codebase.

---

## Table of Contents

- [Application Structure](#application-structure)
- [Configuration & Environment](#configuration--environment)
- [Validation Strategy](#validation-strategy)
- [Service Layer](#service-layer)
- [Error Handling](#error-handling)
- [Response Standardization](#response-standardization)
- [Data Models](#data-models)
- [Middleware Design](#middleware-design)
- [Testing Strategy](#testing-strategy)
- [General Rules](#general-rules)
- [Layer Boundary Summary](#layer-boundary-summary)

---

## Application Structure

### Separate the app from the entry point

The Express `app` object (middleware + routes) lives in one file. The server entry point (calling `listen()`, connecting to DB) lives in a separate file.

**Why:** The app object has no side effects when imported — no ports opened, no DB connections made. This lets tests import it directly and bind it to a random port. If `listen()` were called at import time, every test file would fight over the same port.

**Rule:** Anything that causes I/O side effects at startup belongs in the entry point, not in the importable app module.

---

### Middleware registration order is architectural

The order middleware is registered is load-bearing, not cosmetic:

1. Body parsers — must run before anything reads `req.body`
2. Rate limiters / authentication — early, before expensive work
3. Observability (logging, metrics) — after security checks
4. Routes — the actual handlers
5. 404 catch-all — after all routes, never before
6. Global error handler — absolutely last (identified by its 4-argument signature)

**Rule:** Every middleware position answers "should this run before or after X?" Getting it wrong creates silent bugs. Treat the order as a first-class architectural decision.

---

## Configuration & Environment

### Validate all env vars at startup with immediate failure

Parse and validate every environment variable when the process starts. If anything is invalid, print every broken variable with a clear error message and exit immediately.

**Why:** A misconfigured environment produces mysterious runtime failures — a database that appears connected but fails queries, a port that silently binds incorrectly. Fail-fast at startup converts silent runtime failures into a noisy, immediate, and actionable boot error.

**Rule:** Configuration errors are worse than crashes because they can appear to work while behaving incorrectly. Validate all external inputs at the boundary, as early as possible.

---

### Coerce environment variables to their correct types at the boundary

All environment variables are strings. Coerce them to their intended types (number, boolean, enum) in the config layer. The rest of the application sees typed values.

**Rule:** Type coercion belongs at the single entry point where raw strings arrive — never scattered across usage sites.

---

## Validation Strategy

### Input validation is middleware, not route logic

Create a reusable validation middleware factory that accepts a schema and returns a middleware function. Attach it inline to the routes that need it.

**Why:** Without this, every route handler repeats the same pattern: parse, check success, format errors, return early. The factory pattern eliminates that repetition and keeps route handlers focused on the happy path.

**Rule:** Validation middleware should not just reject bad input — it should also normalize and transform valid input (lowercase, deduplicate, apply defaults) so downstream handlers receive clean, canonical data.

---

### Schemas live in their own layer, separate from database models

An HTTP input schema and a database schema have different jobs:

- **Input schema** — enforces what a client is allowed to send, strips unknown fields, normalizes values, sets input-side defaults
- **Database schema** — enforces storage constraints, defines persistence defaults, declares indexes

**Why:** Coupling them means API contract changes require database schema changes and vice versa. When the API needs to strip a field the client shouldn't set, or accept a field the DB doesn't store, the separation handles it cleanly.

**Rule:** The API contract and the persistence contract are different things. Keep them separate.

---

### Business rules are not validation — they live in services

Schema validation answers: "Is this a well-formed request?" (correct types, required fields, length limits)

Business rules answer: "Does this operation make sense given current state?" (is the user allowed to do this, does this entity exist, is this transition valid)

**Why:** Business rules often require database access. They depend on state that doesn't exist at validation time. They are specific to particular operations, not to input shape.

**Rule:** Schemas validate shape. Services enforce rules that involve state, domain semantics, or multi-step logic.

---

### Report all validation errors at once

Collect every validation failure and return them all in a single response — not just the first error encountered.

**Why:** If a client submits a form with 3 invalid fields and receives one error per request, they need 3 round trips to discover all their mistakes. Most schema libraries (Zod, Joi) naturally produce all failures simultaneously.

**Rule:** Surface all errors at once. Forcing iterative correction is bad developer experience.

---

## Service Layer

### When to create a service function

**Create a service function when:**
- The operation involves more than one DB call
- There are business rules to enforce (state checks, conditional logic)
- Multiple layers of the application need to perform the same operation
- The operation has failure modes that map to domain errors (not just "DB write failed")

**Leave it in the route handler when:**
- It is pure CRUD with no business rules (e.g., simple `Model.create(body)`)
- There is exactly one DB call with no branching logic

**Why:** Premature extraction to services adds indirection without benefit. But the moment business logic appears in a route handler, it becomes untestable without HTTP and unreusable without making HTTP calls.

---

### Services are HTTP-ignorant

No service function should import or reference `Request`, `Response`, or `NextFunction`. Services accept plain values and return plain values.

**Why:** If a service accepts `req`, it is permanently coupled to the HTTP layer. It cannot be called from a CLI tool, a background job, a message queue consumer, or a test that bypasses HTTP. It also cannot be unit-tested without mocking Express objects.

**Rule:** Services operate on domain objects. They must not know how data arrived or how it will be returned.

---

### Services throw typed errors, not return error objects

When something goes wrong, services throw a typed error class with an embedded HTTP status code. They do not return `{ success: false, error: "..." }` objects.

**Why:** If services return result objects, every route handler needs to check `if (!result.success)` and call the appropriate HTTP response function. That translation logic gets repeated across every route. With thrown errors, the global error handler handles translation exactly once.

**Rule:** Services speak in domain terms (throw a `NotFoundError`, throw a `ConflictError`). Routes and error middleware speak in HTTP terms. Never mix the two.

---

### Only create side effects when something actually changed

Before triggering version snapshots, audit logs, notifications, or other side effects, verify that the operation actually changed state. If the submitted data is identical to the current state, skip the side effect.

**Rule:** Idempotent operations should produce no observable side effects. History and audit systems should record meaningful transitions, not noise.

---

### In multi-step write workflows, write the primary record first

When an operation requires multiple writes (e.g., update a document and save an audit snapshot), write the primary document first. Only save the secondary record if the primary succeeded.

**Why:** If you write the audit record first and the primary write fails, you have a phantom audit entry with no corresponding change. Reversing the order means the secondary record only exists when it accurately reflects a real change.

**Rule:** Audit records, version snapshots, and event logs should only be committed after the operation they record has succeeded.

---

## Error Handling

### Route handlers have no try/catch

Route handlers call service functions and send success responses. They do not catch errors. Errors thrown synchronously or from rejected promises flow to the global error handler automatically (Express v5 handles this natively).

**Why:** If every route has a `try/catch`, you either duplicate error-to-HTTP translation logic in every block, or you always call `next(err)` — at which point the `try/catch` is just boilerplate. Remove the boilerplate.

**Rule:** Centralize error translation in one place. Routes do not handle errors; they let them propagate.

---

### Build a typed error hierarchy with status codes embedded

Define a base error class with a `statusCode` property. Extend it for each error type:

```
AppError (base, with statusCode)
  ├── NotFoundError       → 404
  ├── BadRequestError     → 400
  ├── ConflictError       → 409
  └── UnauthorizedError   → 401
```

**Why:** When the error handler receives a `NotFoundError`, it reads `err.statusCode` — no switch statement, no mapping table. New error types work automatically because they extend the base class.

**Rule:** Typed errors carry their HTTP meaning. Adding a new error type should not require touching error-handling infrastructure.

---

### Handle third-party library errors in the global error handler

Database drivers, JSON parsers, and HTTP clients throw their own error types (e.g., Mongoose `CastError`, `SyntaxError` from body parsers). The global error handler should explicitly catch these and convert them to clean, client-safe responses.

**Why:** You cannot control what errors third-party libraries throw. Without this, an invalid ID in the URL produces a raw 500 stack trace instead of a clean 400.

**Rule:** Your error handler is the translation layer between third-party vocabulary and your API's vocabulary.

---

### Never leak internal error details to clients

For unhandled or unexpected errors: log the full error server-side, return a generic "Internal server error" message client-side. Stack traces, file paths, query strings, and internal identifiers are security vulnerabilities, not helpful messages.

**Rule:** Log everything. Reveal nothing.

---

## Response Standardization

### Every response uses the same envelope

All responses — success and error — use a consistent top-level shape:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "message": "...", "errors": [...] } }
```

Implement `sendSuccess()` and `sendError()` helpers that are the only way any handler or middleware sends a response. No ad hoc `res.json({ ... })` calls.

**Why:** Inconsistent response shapes mean every client has to handle each endpoint as a special case. A `success` boolean discriminant makes the response trivially parsable for any consumer.

**Rule:** The envelope is a contract. Enforce it mechanically through shared helpers, not by convention or code review.

---

### Know when your conventions don't apply — and be explicit about it

Some HTTP conventions override application conventions. `204 No Content` means no body by definition — wrapping it in an envelope would be confusing.

**Rule:** Document intentional departures from your own conventions by making them stand out. The exception should be obvious, not hidden.

---

## Data Models

### The schema definition is the single source of truth for types

Define the database schema as a constant object. Derive TypeScript types from it using inference utilities. Never write a TypeScript interface in parallel with a Mongoose/Prisma/Drizzle schema — they will drift.

**Rule:** Types that mirror schema definitions should be derived, not independently declared.

---

### Embed vs. separate collection

**Embed when:**
- The related data is always loaded with the parent (you always need it)
- The data is small and bounded (a fixed-size array of small objects)
- The relationship is 1:few (not 1:many)

**Separate when:**
- The related data is large or grows without bound
- You rarely need the related data (loaded on demand)
- Loading the parent should not load the history/audit/related docs

**Rule:** Embed for convenience when you always access together. Separate when you rarely need the related data or when it is unbounded in size.

---

### Index what you query on

Every query in your codebase implies an index. If you query `{ postId }` and sort by `{ version: -1 }`, you need a compound index on `{ postId: 1, version: -1 }`.

**Rule:** Indexes are not optimization — they are correctness at scale. Add them when you write the query, not when performance degrades.

---

## Middleware Design

### Global vs. inline middleware

- **Global (registered on the app):** applies to every request — rate limiting, authentication, logging, response envelope enforcement
- **Inline (registered on a route):** applies to specific routes — request body validation, permission checks for specific resources

**Rule:** Global concerns go on the app. Route-specific concerns go on the route. Applying a body validator globally would run it on every GET request. Applying rate limiting per-route would duplicate it on every handler.

---

### Stateful middleware must expose a reset function

Any middleware that holds in-memory state (counters, maps, caches) must export a function to reset that state. This is used in test `beforeEach` to prevent cross-test contamination.

**Why:** In-memory state persists across tests within a process. Without reset functions, tests are order-dependent and flaky.

**Rule:** Statefulness and testability are both requirements. Build the reset mechanism into the module's public API from the start.

---

### Normalize variable data before using it as a map key

When collecting aggregate metrics or counts, normalize instance-specific values (UUIDs, ObjectIds, user IDs) to their canonical category before using them as keys.

Example: replace `/posts/507f1f77bcf86cd799439011` with `/posts/:id` so all per-document requests count together.

**Rule:** When collecting aggregate metrics, normalize dimension values to their canonical form. Per-instance keys produce useless noise.

---

## Testing Strategy

### Test behavior, not implementation

Write tests that send real HTTP requests to a real server and assert on what the client sees: status codes, response headers, and response bodies. Do not mock internal layers.

**Why:** The behavior that matters is the behavior a client experiences. Mocked services don't catch validation middleware misconfiguration. Mocked databases don't catch missing indexes or query bugs. Integration failures are the most common source of production bugs.

**Rule:** Test the full request lifecycle. Unit-test only pure business logic functions that have no external dependencies.

---

### Share server lifecycle in a setup module

All test files import a shared setup module that handles: starting the server, connecting to the database, exposing `getBaseUrl()`, and cleaning up after all tests complete.

**Why:** Each test file managing its own server leads to initialization races, port conflicts, and duplicated cleanup code. The setup module owns all of this with a single `setupTestServer()` call per file.

**Rule:** Test infrastructure is shared code. Apply the same DRY principle to tests that you apply to production code.

---

### Use `listen(0)` for test servers

Bind the test server to port 0. The OS assigns an available port. Tests read it dynamically via `server.address().port`.

**Rule:** Never hardcode ports in tests. Port 0 guarantees no conflicts, regardless of what else is running on the machine.

---

### Clean up before each test, not after

Use `beforeEach` to clear test data, not `afterEach`. `beforeEach` runs unconditionally — even if the previous test crashed.

**Why:** `afterEach` cleanup is skipped when a test fails, leaving dirty state for the next test. `beforeEach` guarantees a clean slate every time.

**Rule:** Guarantee your own preconditions. Do not rely on previous tests cleaning up after themselves.

---

### Test negative paths with the same rigor as the happy path

For every validation rule, write a test that breaks it. For every error condition, assert the exact status code and error message.

**Why:** The happy path is usually tested once. Bugs live in edge cases: missing fields, wrong types, duplicate operations, out-of-range values. A validated API contract is only as strong as the negative tests that define its boundaries.

**Rule:** The negative space defines the contract. Test it systematically.

---

### Centralize type-unsafe operations in one typed helper

When using `fetch` in tests under strict TypeScript, `res.json()` returns `Promise<unknown>`. Rather than casting or using `any` at every call site, create a typed helper `json<T>(res)` that centralizes the assertion.

**Rule:** Isolate necessary type-unsafe operations in one place with a well-named helper. Never scatter `as any` across a test suite.

---

## General Rules

**Name every significant constant.** A magic number in a condition cannot explain itself. A named constant documents intent and makes error messages self-referencing.

**Any system that accumulates state without a bound will eventually fail.** Define the maximum (versions per document, items in a queue, records in a table) and enforce it automatically at the point of creation.

**Every request must receive a response.** Between route-level early returns, service-level throws, and a global catch-all error handler, there must be no code path that leaves a request hanging. Design error boundaries to be exhaustive.

**Infrastructure complexity should match actual scale.** Redis is the right choice for distributed rate limiting across multiple server instances. An in-memory `Map` is the right choice for a single-instance service. Adding Redis to a single-process app adds a network hop on every request for zero benefit. Add infrastructure when the problem demands it, not preemptively.

---

## Layer Boundary Summary

| Layer | Owns | Does NOT own |
|---|---|---|
| `config/` | Env parsing, type coercion, fail-fast validation | Any runtime behavior |
| `schemas/` | Input shape, type enforcement, normalization (lowercase, dedup, defaults) | Business rules, DB interaction |
| `middleware/validate` | Invoking schema parse, formatting errors, replacing `req.body` | The schema definition itself |
| `middleware/errorHandler` | Translating all errors into HTTP responses | Route-specific behavior |
| `routes/` | HTTP I/O (params, query, body, status codes), calling services, sending responses | Business logic, DB queries |
| `services/` | Business rules, multi-step orchestration, throwing domain errors | HTTP objects (`req` / `res`) |
| `models/` | DB schema definition, persistence types, indexes | Business logic |
| `errors/` | Typed error classes with embedded status codes | Error handling logic |
| `utils/response` | Envelope serialization helpers | Routing or business logic |
| `tests/setup` | Server lifecycle, shared test helpers, DB cleanup | Test assertions |
