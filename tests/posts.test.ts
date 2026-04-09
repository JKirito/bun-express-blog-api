import { describe, test, expect, beforeEach } from "bun:test";
import mongoose from "mongoose";
import { Post } from "../src/models/post.ts";
import { PostVersion } from "../src/models/postVersion.ts";
import { setupTestServer, getBaseUrl, json } from "./setup.ts";

setupTestServer();

beforeEach(async () => {
  await Post.deleteMany({});
  await PostVersion.deleteMany({});
});

const samplePost = {
  title: "Test Post",
  content: "This is test content that is long enough to be published if needed for tests",
  author: "Alice",
};

interface ErrorBody {
  success: false;
  error: {
    message: string;
    errors?: { field: string; message: string }[];
  };
}

interface SuccessBody {
  success: true;
  data: Record<string, unknown>;
}

function post(path: string, body: unknown) {
  return fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return fetch(`${getBaseUrl()}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /posts", () => {
  test("creates a post as draft and returns 201", async () => {
    const res = await post("/posts", samplePost);
    expect(res.status).toBe(201);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe(samplePost.title);
    expect(body.data.content).toBe(samplePost.content);
    expect(body.data.author).toBe(samplePost.author);
    expect(body.data.status).toBe("draft");
    expect(body.data.tags).toEqual([]);
    expect(body.data._id).toBeDefined();
    expect(body.data.createdAt).toBeDefined();
    expect(body.data.updatedAt).toBeDefined();
  });

  test("creates a post with tags", async () => {
    const res = await post("/posts", { ...samplePost, tags: ["JavaScript", "Bun", "Tutorial"] });
    expect(res.status).toBe(201);
    const body = await json<SuccessBody>(res);
    expect(body.data.tags).toEqual(["javascript", "bun", "tutorial"]);
  });

  test("deduplicates tags", async () => {
    const res = await post("/posts", { ...samplePost, tags: ["Bun", "bun", "BUN"] });
    expect(res.status).toBe(201);
    const body = await json<SuccessBody>(res);
    expect(body.data.tags).toEqual(["bun"]);
  });

  test("returns 400 when tags is not an array", async () => {
    const res = await post("/posts", { ...samplePost, tags: "javascript" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.errors!.some((e) => e.field === "tags")).toBe(true);
  });

  test("returns 400 when tag is empty string", async () => {
    const res = await post("/posts", { ...samplePost, tags: ["valid", ""] });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
  });

  test("returns 400 when more than 10 tags", async () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const res = await post("/posts", { ...samplePost, tags });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
  });

  test("ignores status field in request body", async () => {
    const res = await post("/posts", { ...samplePost, status: "published" });
    expect(res.status).toBe(201);
    const body = await json<SuccessBody>(res);
    expect(body.data.status).toBe("draft");
  });

  test("returns 400 when title is missing", async () => {
    const res = await post("/posts", { content: "no title", author: "Bob" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Validation failed");
    expect(body.error.errors).toBeArrayOfSize(1);
    expect(body.error.errors![0]!.field).toBe("title");
  });

  test("returns 400 when content is missing", async () => {
    const res = await post("/posts", { title: "no content", author: "Bob" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.errors).toBeArrayOfSize(1);
    expect(body.error.errors![0]!.field).toBe("content");
  });

  test("returns 400 when author is missing", async () => {
    const res = await post("/posts", { title: "no author", content: "text" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.errors).toBeArrayOfSize(1);
    expect(body.error.errors![0]!.field).toBe("author");
  });

  test("returns 400 with all errors when all fields missing", async () => {
    const res = await post("/posts", {});
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.errors).toBeArrayOfSize(3);
    const fields = body.error.errors!.map((e) => e.field).sort();
    expect(fields).toEqual(["author", "content", "title"]);
  });

  test("returns 400 when title is empty string", async () => {
    const res = await post("/posts", { title: "", content: "text", author: "Bob" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.errors![0]!.field).toBe("title");
    expect(body.error.errors![0]!.message).toContain("required");
  });

  test("returns 400 when title is wrong type", async () => {
    const res = await post("/posts", { title: 123, content: "text", author: "Bob" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.errors![0]!.field).toBe("title");
  });

  test("returns 400 when title exceeds max length", async () => {
    const res = await post("/posts", {
      title: "a".repeat(201),
      content: "text",
      author: "Bob",
    });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.errors![0]!.field).toBe("title");
    expect(body.error.errors![0]!.message).toContain("200");
  });

  test("strips unknown fields from request body", async () => {
    const res = await post("/posts", { ...samplePost, evil: "hacked" });
    expect(res.status).toBe(201);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.evil).toBeUndefined();
  });
});

describe("GET /posts", () => {
  test("returns empty array when no posts exist", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: unknown[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  test("returns only published posts", async () => {
    await Post.create({ ...samplePost, title: "Draft Post", status: "draft" });
    await Post.create({ ...samplePost, title: "Published Post", status: "published" });

    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: Record<string, unknown>[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.title).toBe("Published Post");
  });

  test("returns published posts sorted by newest first", async () => {
    await Post.create({ ...samplePost, title: "First", status: "published" });
    await Post.create({ ...samplePost, title: "Second", status: "published" });

    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: Record<string, unknown>[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]!.title).toBe("Second");
    expect(body.data[1]!.title).toBe("First");
  });

  test("filters published posts by tag", async () => {
    await Post.create({ ...samplePost, title: "JS Post", tags: ["javascript"], status: "published" });
    await Post.create({ ...samplePost, title: "Go Post", tags: ["go"], status: "published" });
    await Post.create({ ...samplePost, title: "JS Draft", tags: ["javascript"], status: "draft" });

    const res = await fetch(`${getBaseUrl()}/posts?tag=javascript`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: Record<string, unknown>[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.title).toBe("JS Post");
  });

  test("tag filter is case-insensitive", async () => {
    await Post.create({ ...samplePost, title: "JS Post", tags: ["javascript"], status: "published" });

    const res = await fetch(`${getBaseUrl()}/posts?tag=JavaScript`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: Record<string, unknown>[] }>(res);
    expect(body.data).toHaveLength(1);
  });

  test("returns empty array when no posts match tag", async () => {
    await Post.create({ ...samplePost, tags: ["go"], status: "published" });

    const res = await fetch(`${getBaseUrl()}/posts?tag=rust`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: unknown[] }>(res);
    expect(body.data).toEqual([]);
  });
});

describe("GET /posts/tags", () => {
  test("returns popular tags sorted by count", async () => {
    await Post.create({ ...samplePost, title: "P1", tags: ["javascript", "bun"], status: "published" });
    await Post.create({ ...samplePost, title: "P2", tags: ["javascript", "tutorial"], status: "published" });
    await Post.create({ ...samplePost, title: "P3", tags: ["javascript"], status: "published" });

    const res = await fetch(`${getBaseUrl()}/posts/tags`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: { tag: string; count: number }[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data[0]!.tag).toBe("javascript");
    expect(body.data[0]!.count).toBe(3);
    expect(body.data[1]!.count).toBeLessThanOrEqual(body.data[0]!.count);
  });

  test("excludes tags from draft posts", async () => {
    await Post.create({ ...samplePost, title: "Published", tags: ["visible"], status: "published" });
    await Post.create({ ...samplePost, title: "Draft", tags: ["hidden"], status: "draft" });

    const res = await fetch(`${getBaseUrl()}/posts/tags`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: { tag: string; count: number }[] }>(res);
    const tagNames = body.data.map((t) => t.tag);
    expect(tagNames).toContain("visible");
    expect(tagNames).not.toContain("hidden");
  });

  test("returns empty array when no published posts have tags", async () => {
    await Post.create({ ...samplePost, status: "published" });

    const res = await fetch(`${getBaseUrl()}/posts/tags`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: unknown[] }>(res);
    expect(body.data).toEqual([]);
  });

  test("limits to top 10 tags", async () => {
    // Create 12 unique tags across published posts
    for (let i = 0; i < 12; i++) {
      await Post.create({
        ...samplePost,
        title: `Post ${i}`,
        tags: [`tag${i}`],
        status: "published",
      });
    }

    const res = await fetch(`${getBaseUrl()}/posts/tags`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: { tag: string; count: number }[] }>(res);
    expect(body.data).toHaveLength(10);
  });
});

describe("GET /posts/:id", () => {
  test("returns a single post by id", async () => {
    const created = await Post.create(samplePost);

    const res = await fetch(`${getBaseUrl()}/posts/${created._id}`);
    expect(res.status).toBe(200);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe(samplePost.title);
  });

  test("returns 404 for non-existent id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}`);
    expect(res.status).toBe(404);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Post not found");
  });
});

describe("PATCH /posts/:id", () => {
  test("updates a post and returns the updated version", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { title: "Updated Title" });
    expect(res.status).toBe(200);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("Updated Title");
    expect(body.data.content).toBe(samplePost.content);
  });

  test("returns 404 when updating non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await patch(`/posts/${fakeId}`, { title: "nope" });
    expect(res.status).toBe(404);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Post not found");
  });

  test("returns 400 when update field is empty string", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { title: "" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.errors![0]!.field).toBe("title");
  });

  test("returns 400 when update field is wrong type", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { title: 42 });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.errors![0]!.field).toBe("title");
  });

  test("accepts valid partial updates", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { author: "Bob" });
    expect(res.status).toBe(200);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.author).toBe("Bob");
    expect(body.data.title).toBe(samplePost.title);
  });
});

describe("Invalid ObjectId", () => {
  test("GET /posts/:id returns 400 for invalid id format", async () => {
    const res = await fetch(`${getBaseUrl()}/posts/not-a-valid-id`);
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid");
  });

  test("PATCH /posts/:id returns 400 for invalid id format", async () => {
    const res = await patch("/posts/not-a-valid-id", { title: "nope" });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid");
  });

  test("DELETE /posts/:id returns 400 for invalid id format", async () => {
    const res = await fetch(`${getBaseUrl()}/posts/not-a-valid-id`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid");
  });
});

describe("PATCH /posts/:id/publish", () => {
  test("publishes a draft post and returns 200", async () => {
    const created = await Post.create(samplePost);
    expect(created.status).toBe("draft");

    const res = await patch(`/posts/${created._id}/publish`, {});
    expect(res.status).toBe(200);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("published");
  });

  test("returns 409 when post is already published", async () => {
    const created = await Post.create({ ...samplePost, status: "published" });

    const res = await patch(`/posts/${created._id}/publish`, {});
    expect(res.status).toBe(409);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Post is already published");
  });

  test("returns 400 when content is too short to publish", async () => {
    const created = await Post.create({
      title: "Short Post",
      content: "Too short",
      author: "Alice",
    });

    const res = await patch(`/posts/${created._id}/publish`, {});
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("at least 50 characters");
  });

  test("returns 404 when post does not exist", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await patch(`/posts/${fakeId}/publish`, {});
    expect(res.status).toBe(404);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Post not found");
  });

  test("returns 400 for invalid ObjectId", async () => {
    const res = await patch("/posts/not-valid/publish", {});
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid");
  });
});

describe("DELETE /posts/:id", () => {
  test("deletes a post and returns 204", async () => {
    const created = await Post.create(samplePost);

    const res = await fetch(`${getBaseUrl()}/posts/${created._id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    const check = await Post.findById(created._id);
    expect(check).toBeNull();
  });

  test("returns 404 when deleting non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Post not found");
  });
});

// ── Versioning ────────────────────────────────────────────────

describe("POST /posts/:id versioning", () => {
  const longContent = "A".repeat(60); // satisfies 50-char publish requirement

  async function createPost(overrides = {}) {
    const res = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...samplePost, content: longContent, ...overrides }),
    });
    const body = await json(res);
    return body.data as Record<string, unknown>;
  }

  test("PATCH /posts/:id creates a version on edit", async () => {
    const post = await createPost();
    const res = await fetch(`${getBaseUrl()}/posts/${post._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.title).toBe("Updated Title");
    expect(body.data.currentVersion).toBe(1);

    // Check version was saved
    const historyRes = await fetch(`${getBaseUrl()}/posts/${post._id}/history`);
    const historyBody = await json<{ success: boolean; data: unknown[] }>(historyRes);
    expect(historyBody.data).toHaveLength(1);
    const version = historyBody.data[0] as Record<string, unknown>;
    expect(version.version).toBe(1);
    const snapshot = version.snapshot as Record<string, unknown>;
    expect(snapshot.title).toBe(samplePost.title); // original title
  });

  test("multiple edits create incrementing versions", async () => {
    const post = await createPost();

    // Edit 1
    await fetch(`${getBaseUrl()}/posts/${post._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edit 1" }),
    });

    // Edit 2
    await fetch(`${getBaseUrl()}/posts/${post._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edit 2" }),
    });

    // Edit 3
    const res = await fetch(`${getBaseUrl()}/posts/${post._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Edit 3" }),
    });
    const body = await json(res);
    expect(body.data.currentVersion).toBe(3);

    const historyRes = await fetch(`${getBaseUrl()}/posts/${post._id}/history`);
    const historyBody = await json<{ success: boolean; data: unknown[] }>(historyRes);
    expect(historyBody.data).toHaveLength(3);

    // Newest first
    const versions = historyBody.data as Record<string, unknown>[];
    expect(versions[0]!.version).toBe(3);
    expect(versions[1]!.version).toBe(2);
    expect(versions[2]!.version).toBe(1);
  });
});

describe("GET /posts/:id/history", () => {
  const longContent = "A".repeat(60);

  test("returns empty array for post with no edits", async () => {
    const createRes = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...samplePost, content: longContent }),
    });
    const created = (await json(createRes)).data as Record<string, unknown>;

    const res = await fetch(`${getBaseUrl()}/posts/${created._id}/history`);
    expect(res.status).toBe(200);
    const body = await json<{ success: boolean; data: unknown[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  test("returns 404 for non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}/history`);
    expect(res.status).toBe(404);
    const body = await json<ErrorBody>(res);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Post not found");
  });

  test("snapshot contains the state before the edit", async () => {
    const createRes = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...samplePost, content: longContent, tags: ["original"] }),
    });
    const created = (await json(createRes)).data as Record<string, unknown>;

    // Edit title and tags
    await fetch(`${getBaseUrl()}/posts/${created._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title", tags: ["updated"] }),
    });

    const historyRes = await fetch(`${getBaseUrl()}/posts/${created._id}/history`);
    const historyBody = await json<{ success: boolean; data: unknown[] }>(historyRes);
    const version = historyBody.data[0] as Record<string, unknown>;
    const snapshot = version.snapshot as Record<string, unknown>;

    // Snapshot should have the ORIGINAL values
    expect(snapshot.title).toBe(samplePost.title);
    expect(snapshot.content).toBe(longContent);
    expect(snapshot.tags).toEqual(["original"]);
  });
});

describe("PATCH /posts/:id/rollback/:version", () => {
  const longContent = "A".repeat(60);

  async function createAndEdit() {
    // Create
    const createRes = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...samplePost, content: longContent, tags: ["v0"] }),
    });
    const created = (await json(createRes)).data as Record<string, unknown>;

    // Edit 1: change title
    await fetch(`${getBaseUrl()}/posts/${created._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Version 1 Title" }),
    });

    // Edit 2: change content
    await fetch(`${getBaseUrl()}/posts/${created._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Version 2 content that is long enough for publishing" }),
    });

    return created._id as string;
  }

  test("rolls back to a specific version", async () => {
    const postId = await createAndEdit();

    // Rollback to version 1 (state before edit 1 = original state)
    const res = await fetch(`${getBaseUrl()}/posts/${postId}/rollback/1`, {
      method: "PATCH",
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe(samplePost.title); // back to original
    expect(body.data.content).toBe(longContent); // back to original
  });

  test("rollback creates a new version (the rollback itself is versioned)", async () => {
    const postId = await createAndEdit();

    // Before rollback: 2 versions (from 2 edits)
    const beforeRes = await fetch(`${getBaseUrl()}/posts/${postId}/history`);
    const beforeBody = await json<{ success: boolean; data: unknown[] }>(beforeRes);
    expect(beforeBody.data).toHaveLength(2);

    // Rollback to version 1
    await fetch(`${getBaseUrl()}/posts/${postId}/rollback/1`, { method: "PATCH" });

    // After rollback: 3 versions (rollback saved current state as version 3)
    const afterRes = await fetch(`${getBaseUrl()}/posts/${postId}/history`);
    const afterBody = await json<{ success: boolean; data: unknown[] }>(afterRes);
    expect(afterBody.data).toHaveLength(3);

    const postRes = await fetch(`${getBaseUrl()}/posts/${postId}`);
    const postBody = await json(postRes);
    expect(postBody.data.currentVersion).toBe(3);
  });

  test("rolling back a published post keeps it published", async () => {
    const postId = await createAndEdit();

    // Publish first
    await fetch(`${getBaseUrl()}/posts/${postId}/publish`, { method: "PATCH" });

    // Rollback
    const res = await fetch(`${getBaseUrl()}/posts/${postId}/rollback/1`, {
      method: "PATCH",
    });
    const body = await json(res);
    expect(body.data.status).toBe("published");
  });

  test("returns 404 for non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}/rollback/1`, {
      method: "PATCH",
    });
    expect(res.status).toBe(404);
  });

  test("returns 404 for non-existent version", async () => {
    const postId = await createAndEdit();
    const res = await fetch(`${getBaseUrl()}/posts/${postId}/rollback/999`, {
      method: "PATCH",
    });
    expect(res.status).toBe(404);
    const body = await json<ErrorBody>(res);
    expect(body.error.message).toBe("Version 999 not found");
  });

  test("returns 400 when trying to rollback to version 0", async () => {
    const postId = await createAndEdit();
    const res = await fetch(`${getBaseUrl()}/posts/${postId}/rollback/0`, {
      method: "PATCH",
    });
    expect(res.status).toBe(400);
    const body = await json<ErrorBody>(res);
    expect(body.error.message).toBe("Cannot rollback to version 0 (original creation)");
  });
});

describe("Version pruning", () => {
  const longContent = "A".repeat(60);

  test("prunes versions beyond 50, keeping the newest", async () => {
    // Create a post
    const createRes = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...samplePost, content: longContent }),
    });
    const created = (await json(createRes)).data as Record<string, unknown>;
    const postId = created._id as string;

    // Insert 52 versions directly (faster than 52 HTTP calls)
    const versions = Array.from({ length: 52 }, (_, i) => ({
      postId: new mongoose.Types.ObjectId(postId),
      version: i + 1,
      snapshot: { title: `Version ${i + 1}`, content: longContent, author: "Alice", tags: [] },
    }));
    await PostVersion.insertMany(versions);
    await Post.findByIdAndUpdate(postId, { currentVersion: 52 });

    // Trigger one more edit to invoke pruning
    const res = await fetch(`${getBaseUrl()}/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Trigger prune" }),
    });
    expect(res.status).toBe(200);

    // Should have exactly 50 versions (pruned oldest)
    const count = await PostVersion.countDocuments({ postId });
    expect(count).toBe(50);

    // Oldest remaining should be version 4 (1, 2, 3 pruned; 53 is the new one)
    const oldest = await PostVersion.findOne({ postId }).sort({ version: 1 });
    expect(oldest!.version).toBe(4);
  });
});
