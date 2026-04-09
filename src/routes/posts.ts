import { Router, type Request, type Response } from "express";
import { Post } from "../models/post.ts";
import { validate } from "../middleware/validate.ts";
import { createPostSchema, updatePostSchema } from "../schemas/post.ts";
import { sendSuccess, sendError } from "../utils/response.ts";
import { publishPost } from "../services/post.service.ts";

const router = Router();

// GET /posts - List all published posts
router.get("/", async (_req: Request, res: Response) => {
  const posts = await Post.find({ status: "published" }).sort({ createdAt: -1 });
  sendSuccess(res, posts);
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
  const post = await publishPost(req.params["id"]!);
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
