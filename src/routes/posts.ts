import { Router, type Request, type Response } from "express";
import { Post } from "../models/post.ts";
import { validate } from "../middleware/validate.ts";
import { createPostSchema, updatePostSchema } from "../schemas/post.ts";
import { sendSuccess, sendError } from "../utils/response.ts";
import { publishPost, getPublishedPosts, getPopularTags } from "../services/post.service.ts";

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

// PATCH /posts/:id - Update a post
router.patch("/:id", validate(updatePostSchema), async (req: Request, res: Response) => {
  const post = await Post.findByIdAndUpdate(req.params["id"], req.body, {
    returnDocument: "after",
    runValidators: true,
  });

  if (!post) {
    sendError(res, "Post not found", 404);
    return;
  }
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
