import { describe, test, expect, beforeEach } from "bun:test";
import mongoose from "mongoose";
import { Post } from "../src/models/post.ts";
import { setupTestServer, getBaseUrl, json } from "./setup.ts";

setupTestServer();

beforeEach(async () => {
  await Post.deleteMany({});
});

const samplePost = {
  title: "Test Post",
  content: "This is test content",
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
  test("creates a post and returns 201", async () => {
    const res = await post("/posts", samplePost);
    expect(res.status).toBe(201);
    const body = await json<SuccessBody>(res);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe(samplePost.title);
    expect(body.data.content).toBe(samplePost.content);
    expect(body.data.author).toBe(samplePost.author);
    expect(body.data._id).toBeDefined();
    expect(body.data.createdAt).toBeDefined();
    expect(body.data.updatedAt).toBeDefined();
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

  test("returns all posts sorted by newest first", async () => {
    await Post.create({ ...samplePost, title: "First" });
    await Post.create({ ...samplePost, title: "Second" });

    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const body = await json<{ success: true; data: Record<string, unknown>[] }>(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]!.title).toBe("Second");
    expect(body.data[1]!.title).toBe("First");
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
