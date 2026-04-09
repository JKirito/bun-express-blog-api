import { Router, type Request, type Response } from "express";
import { Post } from "../models/post.ts";
import { validate } from "../middleware/validate.ts";
import { createPostSchema, updatePostSchema } from "../schemas/post.ts";
import { sendSuccess, sendError } from "../utils/response.ts";
import { publishPost, getPublishedPosts, getPopularTags, updatePost } from "../services/post.service.ts";
import { getHistory, rollbackPost } from "../services/version.service.ts";

const router = Router();

// GET /posts - List all published posts (optionally filtered by tag)
router.get("/", async (req: Request, res: Response) => {
  const tag = req.query["tag"] as string | undefined;
  const posts = await getPublishedPosts(tag);
  sendSuccess(res, posts);
});

// GET /posts/tags - Get popular tags across published posts
router.get("/tags", async (_req: Request, res: Response) => {
  const tags = await getPopularTags();
  sendSuccess(res, tags);
});

// GET /posts/:id/history - Get edit history for a post
router.get("/:id/history", async (req: Request, res: Response) => {
  const history = await getHistory(req.params["id"] as string);
  sendSuccess(res, history);
});

// GET /posts/:id - Get a single post
router.get("/:id", async (req: Request, res: Response) => {
  const post = await Post.findById(req.params["id"]);
  if (!post) {
    sendError(res, "Post not found", 404);
    return;
  }
  sendSuccess(res, post);
});

// POST /posts - Create a new post
router.post("/", validate(createPostSchema), async (req: Request, res: Response) => {
  const post = await Post.create(req.body);
  sendSuccess(res, post, 201);
});

// PATCH /posts/:id - Update a post (creates a version)
router.patch("/:id", validate(updatePostSchema), async (req: Request, res: Response) => {
  const post = await updatePost(req.params["id"] as string, req.body as Record<string, unknown>);
  sendSuccess(res, post);
});

// PATCH /posts/:id/rollback/:version - Rollback to a specific version
router.patch("/:id/rollback/:version", async (req: Request, res: Response) => {
  const version = parseInt(req.params["version"] as string, 10);
  if (isNaN(version)) {
    sendError(res, "Version must be a number", 400);
    return;
  }
  const post = await rollbackPost(req.params["id"] as string, version);
  sendSuccess(res, post);
});

// PATCH /posts/:id/publish - Publish a draft post
router.patch("/:id/publish", async (req: Request, res: Response) => {
  const post = await publishPost(req.params["id"] as string);
  sendSuccess(res, post);
});

// DELETE /posts/:id - Delete a post
router.delete("/:id", async (req: Request, res: Response) => {
  const post = await Post.findByIdAndDelete(req.params["id"]);
  if (!post) {
    sendError(res, "Post not found", 404);
    return;
  }
  res.status(204).send();
});

export default router;
