# Engineering Standards & Project Organization

This document defines **how to work in this codebase** — how features are structured, where files go, how concerns are separated, and how to make decisions consistently as the project grows. Every rule here is derived from real decisions made while building this project.

---

## Table of Contents

- [Folder Structure](#folder-structure)
- [Feature Modules: When & How to Organize](#feature-modules-when--how-to-organize)
- [What Goes in Each File Type](#what-goes-in-each-file-type)
- [Naming Conventions](#naming-conventions)
- [Adding a New Feature: Step-by-Step](#adding-a-new-feature-step-by-step)
- [Git Workflow & Branch Strategy](#git-workflow--branch-strategy)
- [Commit Message Format](#commit-message-format)
- [PR Standards](#pr-standards)
- [Deployment Environments](#deployment-environments)
- [Logging Standards](#logging-standards)
- [What Belongs Where: Decision Flowchart](#what-belongs-where-decision-flowchart)

---

## Folder Structure

### feature modules

Switch when you are about to add a **third or fourth distinct domain** beyond what already exists — for example, adding `users`, `comments`, or `payments` alongside the existing `posts`.

The signal is: when opening a folder shows files from multiple unrelated domains and you have to mentally filter to find the ones you need.

### Feature-module structure (use when the codebase grows beyond 4 domains)

```
src/
├── modules/
│   ├── posts/
│   │   ├── post.model.ts
│   │   ├── post.schema.ts
│   │   ├── post.routes.ts
│   │   ├── post.service.ts
│   │   ├── post.version.model.ts
│   │   └── post.version.service.ts
│   ├── users/
│   │   ├── user.model.ts
│   │   ├── user.schema.ts
│   │   ├── user.routes.ts
│   │   └── user.service.ts
│   └── payments/
│       ├── payment.model.ts
│       ├── payment.routes.ts
│       └── payment.service.ts
├── shared/
│   ├── middleware/          # Cross-cutting: rate limiter, error handler, validate
│   ├── errors/              # AppError hierarchy
│   ├── utils/               # response.ts helpers
│   └── config/              # env config
├── app.ts
├── server.ts
└── db.ts
tests/
├── setup.ts
├── posts/
│   ├── posts.crud.test.ts
│   ├── posts.publish.test.ts
│   └── posts.versions.test.ts
└── shared/
    └── app.test.ts
```

**Rule:** Do not migrate to feature modules prematurely. Doing it with 2 domains adds indirection for no benefit. Waiting until you have 6 domains means a painful migration under time pressure. The right time is at the third or fourth domain.

---

## What Goes in Each File Type

### `config/index.ts`

**Contains:** Zod schema for all environment variables. Parses, coerces (string → number, string → enum), validates, and exports a typed config object.

**Does not contain:** Any runtime behavior, middleware, or business logic.

**Rule:** Every environment variable the app reads must be declared here. No `process.env.*` access anywhere else in the codebase.

---

### `models/*.ts`

**Contains:** Mongoose schema definition, model export, TypeScript type derived from the schema, index declarations.

**Does not contain:** Business logic, service functions, HTTP-related code.

**Rule:** The schema is the single source of truth for the shape of persisted data. TypeScript types must be derived from the schema, not written in parallel.

```ts
// Correct — type derived from schema
const PostSchema = new Schema({ title: { type: String, required: true } });
type IPost = InferSchemaType<typeof PostSchema>;

// Wrong — type written independently, will drift
interface IPost { title: string }
```

---

### `schemas/*.ts`

**Contains:** Zod schemas for validating and normalizing HTTP request bodies. Inferred TypeScript types for validated input.

**Does not contain:** Database interaction, business rules, anything requiring state.

**Rule:** Input schemas and database models are different contracts. A field the client sends may not be stored (e.g., `status` is stripped from create/update — only the publish endpoint sets it). A field the database stores may not be exposed to clients. Keep them separate.

```ts
// Input schema: controls what the client is allowed to send
export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  author: z.string().min(1).max(100),
  tags: tagsSchema,
});
// 'status' is intentionally absent — client cannot set it directly
```

---

### `middleware/*.ts`

**Contains:** Functions with the signature `(req, res, next)` or `(err, req, res, next)`. Logic that applies to all routes (global) or is attached inline to specific routes.

**Does not contain:** Business logic, DB queries (except auth middleware that may need a DB lookup), response body construction outside of error formatting.

**Rule:** Global middleware goes in this folder and is registered on the app. Inline middleware (route-level validation) uses the factory pattern from `validate.ts` and is attached at the route definition.

**Stateful middleware must export a reset function:**

```ts
// rateLimiter.ts
const store = new Map<string, { count: number; resetTime: number }>();

export function resetRateLimitStore() {
  store.clear();
}
```

This function is called in `tests/setup.ts` `beforeEach` to prevent cross-test contamination.

---

### `routes/*.ts`

**Contains:** Route definitions. Each handler does exactly: extract params/query/body → call a service or model → send a response via `sendSuccess()` or `sendError()`. Input validation is attached as middleware on the route.

**Does not contain:** Business logic, DB queries (except simple CRUD with no rules), try/catch blocks.

**Rule:** A route handler that is longer than ~10 lines is doing too much. Extract the logic to a service.

```ts
// Correct — route handler is thin
router.patch("/:id/publish", async (req: Request, res: Response) => {
  const post = await publishPost(req.params["id"] as string);
  sendSuccess(res, post);
});

// Wrong — business logic in the route
router.patch("/:id/publish", async (req: Request, res: Response) => {
  const post = await Post.findById(req.params["id"]);
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  if (post.status === "published") { res.status(409).json({ error: "..." }); return; }
  if (post.content.length < 50) { res.status(400).json({ error: "..." }); return; }
  post.status = "published";
  await post.save();
  res.json(post);
});
```

---

### `services/*.ts`

**Contains:** Business logic. Functions that enforce rules, coordinate multiple DB operations, and throw typed errors when rules are violated.

**Does not contain:** `Request`, `Response`, `NextFunction`, or anything from Express. No `sendSuccess()` or `sendError()` calls.

**When to create a service function:**
- The operation involves more than one DB call
- There are business rules to enforce (state checks, transitions, conditional logic)
- The same operation is needed from multiple entry points (HTTP handler + background worker + CLI)
- The operation has failure modes that should map to specific error types

**When to leave it in the route handler:**
- It is a single DB call with no business rules (e.g., `Post.findById(id)` directly in a GET handler)

**Rule:** Services are HTTP-ignorant. They take plain values, return plain values, and throw typed errors. They can be called from anywhere — HTTP handler, cron job, CLI script — without modification.

---

### `errors/index.ts`

**Contains:** `AppError` base class and all typed error subclasses. Each subclass carries its HTTP status code.

**Does not contain:** Error handling logic — that lives in `middleware/errorHandler.ts`.

```ts
export class AppError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") { super(message, 404); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409); }
}
```

**Rule:** Adding a new error type requires only adding a class here. No other file needs to change. The error handler reads `statusCode` from the base class automatically.

---

### `utils/response.ts`

**Contains:** `sendSuccess(res, data, status?)` and `sendError(res, message, status?, errors?)` — the only two functions that may write a response body in this application.

**Does not contain:** Routing, business logic, or any conditional behavior beyond formatting.

**Rule:** No route handler or middleware may call `res.json()` directly. All responses go through these helpers to guarantee envelope consistency.

---

### `tests/setup.ts`

**Contains:** `setupTestServer()`, `getBaseUrl()`, `json<T>()`. Handles server start on port 0, DB connection to test database, and teardown.

**Does not contain:** Test assertions, test-specific data setup.

**Rule:** Every test file calls `setupTestServer()` and uses `getBaseUrl()` for requests. No test file manages its own server or DB lifecycle.

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `kebab-case` | `post.service.ts`, `error-handler.ts` |
| Services | `noun.service.ts` | `post.service.ts`, `version.service.ts` |
| Models | `noun.ts` (singular) | `post.ts`, `postVersion.ts` |
| Schemas | `noun.ts` (singular) | `post.ts` |
| Routes | `noun.ts` (plural) | `posts.ts` |
| Classes | `PascalCase` | `NotFoundError`, `PostVersion` |
| Functions | `camelCase`, verb-first | `publishPost`, `getPopularTags`, `saveVersion` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_VERSIONS`, `RATE_LIMIT_WINDOW_MS` |
| Zod schemas | `camelCase` + `Schema` suffix | `createPostSchema`, `updatePostSchema` |
| Error classes | `PascalCase` + `Error` suffix | `NotFoundError`, `ConflictError` |

---

## Adding a New Feature: Step-by-Step

This is the exact order to follow every time a new resource or capability is added.

### Step 1: Define the data model

Create `src/models/<noun>.ts`. Define the Mongoose schema, declare all indexes, export the model and inferred type.

### Step 2: Write the Zod input schema

Create `src/schemas/<noun>.ts`. Define schemas for create and update operations. Add transforms (lowercase, deduplicate, trim). Do not include fields the client should not set (e.g., status flags managed by service logic).

### Step 3: Add typed errors if needed

Open `src/errors/index.ts`. Add any new `AppError` subclasses this feature needs that don't already exist. Only add what's new — don't duplicate existing ones.

### Step 4: Write the service

Create `src/services/<noun>.service.ts`. Implement all business logic functions. Services throw typed errors, never return error objects. No Express imports.

### Step 5: Define the routes

Create (or add to) `src/routes/<noun>.ts`. Each handler: extract from request → call service → `sendSuccess()`. Attach `validate(schema)` middleware inline on write routes. No business logic in handlers.

### Step 6: Register the routes in `app.ts`

Add `app.use("/<path>", <router>)` in `src/app.ts`. Register it after existing routes, before the `notFoundHandler`.

### Step 7: Write tests

Create `tests/<noun>.test.ts`. Import `setupTestServer` and `getBaseUrl` from `tests/setup.ts`. Cover: happy path, all validation failure cases, all business rule violations, edge cases.

### Step 8: Run tests

```bash
bun test
```

All existing tests must still pass. If they don't, the new feature broke something — fix it before committing.

### Step 9: Commit

Use the conventional commit format (see below).

---

## Git Workflow & Branch Strategy

### Long-lived branches

| Branch | Deploys to | Purpose |
|---|---|---|
| `main` | Production | Always deployable. Only receives merges from `dev` (or `hotfix/*`). |
| `dev` | Staging / Dev server | Integration branch. All features land here first. |

### Short-lived branches (your daily work)

Always branch off `dev`. Never branch off `main` unless it is a hotfix.

```
feature/<short-description>   — new functionality
fix/<short-description>        — bug fixes
chore/<short-description>      — dependency updates, config changes
refactor/<short-description>   — code restructuring with no behavior change
docs/<short-description>       — documentation only
```

**Examples:**
```
feature/user-authentication
feature/post-scheduling
fix/publish-returns-wrong-status
chore/upgrade-zod-v5
refactor/extract-payment-service
docs/update-api-reference
```

### The flow

```
1. Pull latest dev
   git checkout dev && git pull

2. Create your branch
   git checkout -b feature/post-scheduling

3. Work and commit (small, frequent commits)

4. Push and open a Draft PR to dev early
   — lets teammates see what's in progress

5. Mark ready for review when done
   — CI must pass before review is requested

6. Get approval + CI green → merge to dev
   — delete the branch after merge

7. When a batch of features is ready and tested:
   PR from dev to main → production deploy
```

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description in present tense, lowercase>

[optional body explaining WHY, not WHAT]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New functionality visible to users or API consumers |
| `fix` | Bug fix |
| `chore` | Maintenance: dependency updates, config changes, CI tweaks |
| `refactor` | Code change with no behavior change (restructuring, renaming) |
| `test` | Adding or updating tests only |
| `docs` | Documentation only |
| `perf` | Performance improvement |

### Examples

```
feat: add rate limiting middleware (100 req/min per IP)
fix: publish endpoint returns 409 instead of 400 for short content
chore: upgrade zod from 4.3.6 to 4.4.0
refactor: extract updatePost logic into post service
test: add versioning tests for rollback edge cases
docs: update API reference with /history endpoint
```

### Rules

- Present tense, lowercase: `add rate limiting` not `Added Rate Limiting`
- First line under 72 characters
- Describe **why** in the body if the change is non-obvious — the diff shows what changed, the message explains the reasoning
- One commit should do one thing — do not bundle unrelated changes

---

## Deployment Environments

### Environment-to-branch mapping

| Environment | Branch | Who deploys |
|---|---|---|
| Local | Your feature branch | You |
| Dev / Staging | `dev` | Auto-deploy on merge |
| Production | `main` | Auto-deploy on merge |

**Rule:** Never commit `.env` files. Use `.env.example` as the template. Real values are injected by the deployment platform or a secrets manager.

## Logging Standards

### Use structured (JSON) logs, not plain text

Every log line must be a JSON object. This is the difference between logs you can query and logs that are useless at 3am.

**Do not:**
```ts
console.log(`POST /posts 201 45ms`);
console.error("Post not found");
```

**Do:**
```ts
logger.info({ method: "POST", path: "/posts", status: 201, duration: 45, requestId: "abc-123" });
logger.error({ message: "Post not found", postId: "507f1f77", requestId: "abc-123" });
```

### Required fields on every log line

| Field | Type | Description |
|---|---|---|
| `level` | `info \| warn \| error \| debug` | Severity |
| `time` | Unix timestamp | When it happened |
| `requestId` | UUID | Correlates all logs for a single request |
| `message` | string | Human-readable description (errors only; request logs use method/path/status) |

### Log levels

| Level | When to use |
|---|---|
| `error` | Unhandled exceptions, DB disconnects, things that need attention |
| `warn` | Rate limit hit, auth failure, deprecated field used — handled but notable |
| `info` | Normal significant events: server started, request completed |
| `debug` | Development only: query details, cache hits, internal state |

**Rule:** Production runs at `info`. Development runs at `debug`. Controlled by `LOG_LEVEL` environment variable.

### One log line per request

The `pino-http` middleware logs one line per request automatically with: method, path, status, duration, and requestId. Do not add additional `logger.info` calls inside route handlers for the same information — it creates duplicate noise.

Log inside services and handlers only for:
- Errors with context (`logger.error`)
- Significant business events (`logger.info` — e.g., "Post auto-published by scheduler")
- Debug tracing during development (`logger.debug`)

---

## What Belongs Where: Decision Flowchart

When adding new code, use this to decide where it goes:

```
Is this about reading/coercing environment variables?
  → config/index.ts

Is this about what shape of data a client is allowed to send?
  → schemas/<noun>.ts (Zod schema)

Is this about how data is stored in the database?
  → models/<noun>.ts (Mongoose schema)

Does this logic require knowing the current state of the database
to decide if an operation is valid?
  → services/<noun>.service.ts (business rule)

Is this a pure CRUD operation — one DB call, no branching, no rules?
  → routes/<noun>.ts (leave in handler)

Does this apply to every request regardless of route?
  → middleware/ (global middleware, register in app.ts)

Does this apply only to specific routes?
  → inline middleware on the route definition (e.g., validate(schema))

Is this about converting an error into an HTTP response?
  → middleware/errorHandler.ts

Is this about formatting a success or error response body?
  → utils/response.ts (sendSuccess / sendError)

Is this a new type of error with a specific HTTP status code?
  → errors/index.ts (new AppError subclass)

Is this test infrastructure (server lifecycle, DB setup)?
  → tests/setup.ts

Is this a test assertion for a specific resource?
  → tests/<noun>.test.ts
```

### The hard rule on HTTP objects

`Request`, `Response`, and `NextFunction` from Express must never appear in:
- `services/`
- `models/`
- `errors/`
- `config/`
- `utils/` (except response.ts which exists specifically to wrap `res`)

If you find yourself importing Express types in a service, you are in the wrong layer.
