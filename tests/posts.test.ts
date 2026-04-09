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
    const data = await json(res);
    expect(data.title).toBe(samplePost.title);
    expect(data.content).toBe(samplePost.content);
    expect(data.author).toBe(samplePost.author);
    expect(data._id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  test("returns 400 when title is missing", async () => {
    const res = await post("/posts", { content: "no title", author: "Bob" });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors).toBeArrayOfSize(1);
    expect(data.errors[0]!.field).toBe("title");
  });

  test("returns 400 when content is missing", async () => {
    const res = await post("/posts", { title: "no content", author: "Bob" });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors).toBeArrayOfSize(1);
    expect(data.errors[0]!.field).toBe("content");
  });

  test("returns 400 when author is missing", async () => {
    const res = await post("/posts", { title: "no author", content: "text" });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors).toBeArrayOfSize(1);
    expect(data.errors[0]!.field).toBe("author");
  });

  test("returns 400 with all errors when all fields missing", async () => {
    const res = await post("/posts", {});
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors).toBeArrayOfSize(3);
    const fields = data.errors.map((e) => e.field).sort();
    expect(fields).toEqual(["author", "content", "title"]);
  });

  test("returns 400 when title is empty string", async () => {
    const res = await post("/posts", { title: "", content: "text", author: "Bob" });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors[0]!.field).toBe("title");
    expect(data.errors[0]!.message).toContain("required");
  });

  test("returns 400 when title is wrong type", async () => {
    const res = await post("/posts", { title: 123, content: "text", author: "Bob" });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors[0]!.field).toBe("title");
  });

  test("returns 400 when title exceeds max length", async () => {
    const res = await post("/posts", {
      title: "a".repeat(201),
      content: "text",
      author: "Bob",
    });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors[0]!.field).toBe("title");
    expect(data.errors[0]!.message).toContain("200");
  });

  test("strips unknown fields from request body", async () => {
    const res = await post("/posts", { ...samplePost, evil: "hacked" });
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.evil).toBeUndefined();
  });
});

describe("GET /posts", () => {
  test("returns empty array when no posts exist", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const data = await json<unknown[]>(res);
    expect(data).toEqual([]);
  });

  test("returns all posts sorted by newest first", async () => {
    await Post.create({ ...samplePost, title: "First" });
    await Post.create({ ...samplePost, title: "Second" });

    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const data = await json<Record<string, unknown>[]>(res);
    expect(data).toHaveLength(2);
    expect(data[0]!.title).toBe("Second");
    expect(data[1]!.title).toBe("First");
  });
});

describe("GET /posts/:id", () => {
  test("returns a single post by id", async () => {
    const created = await Post.create(samplePost);

    const res = await fetch(`${getBaseUrl()}/posts/${created._id}`);
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.title).toBe(samplePost.title);
  });

  test("returns 404 for non-existent id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}`);
    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toBe("Post not found");
  });
});

describe("PATCH /posts/:id", () => {
  test("updates a post and returns the updated version", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { title: "Updated Title" });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.title).toBe("Updated Title");
    expect(data.content).toBe(samplePost.content);
  });

  test("returns 404 when updating non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await patch(`/posts/${fakeId}`, { title: "nope" });
    expect(res.status).toBe(404);
  });

  test("returns 400 when update field is empty string", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { title: "" });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors[0]!.field).toBe("title");
  });

  test("returns 400 when update field is wrong type", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { title: 42 });
    expect(res.status).toBe(400);
    const data = await json<{ errors: { field: string; message: string }[] }>(res);
    expect(data.errors[0]!.field).toBe("title");
  });

  test("accepts valid partial updates", async () => {
    const created = await Post.create(samplePost);

    const res = await patch(`/posts/${created._id}`, { author: "Bob" });
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.author).toBe("Bob");
    expect(data.title).toBe(samplePost.title);
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
  });
});
