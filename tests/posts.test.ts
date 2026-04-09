import { describe, test, expect, beforeEach } from "bun:test";
import mongoose from "mongoose";
import { Post } from "../src/models/post.ts";
import { setupTestServer, getBaseUrl } from "./setup.ts";

setupTestServer();

beforeEach(async () => {
  await Post.deleteMany({});
});

const samplePost = {
  title: "Test Post",
  content: "This is test content",
  author: "Alice",
};

describe("POST /posts", () => {
  test("creates a post and returns 201", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePost),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe(samplePost.title);
    expect(data.content).toBe(samplePost.content);
    expect(data.author).toBe(samplePost.author);
    expect(data._id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  test("returns 400 when title is missing", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "no title", author: "Bob" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("returns 400 when content is missing", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "no content", author: "Bob" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 when author is missing", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "no author", content: "text" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /posts", () => {
  test("returns empty array when no posts exist", async () => {
    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  test("returns all posts sorted by newest first", async () => {
    await Post.create({ ...samplePost, title: "First" });
    await Post.create({ ...samplePost, title: "Second" });

    const res = await fetch(`${getBaseUrl()}/posts`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].title).toBe("Second");
    expect(data[1].title).toBe("First");
  });
});

describe("GET /posts/:id", () => {
  test("returns a single post by id", async () => {
    const post = await Post.create(samplePost);

    const res = await fetch(`${getBaseUrl()}/posts/${post._id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe(samplePost.title);
  });

  test("returns 404 for non-existent id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Post not found");
  });
});

describe("PATCH /posts/:id", () => {
  test("updates a post and returns the updated version", async () => {
    const post = await Post.create(samplePost);

    const res = await fetch(`${getBaseUrl()}/posts/${post._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Updated Title");
    expect(data.content).toBe(samplePost.content);
  });

  test("returns 404 when updating non-existent post", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${getBaseUrl()}/posts/${fakeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /posts/:id", () => {
  test("deletes a post and returns 204", async () => {
    const post = await Post.create(samplePost);

    const res = await fetch(`${getBaseUrl()}/posts/${post._id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    // Verify it's actually gone
    const check = await Post.findById(post._id);
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
