import { Router, type Request, type Response } from "express";
import { Post } from "../models/post.ts";
import { validate } from "../middleware/validate.ts";
import { createPostSchema, updatePostSchema } from "../schemas/post.ts";

const router = Router();

// GET /posts - List all posts
router.get("/", async (_req: Request, res: Response) => {
  const posts = await Post.find().sort({ createdAt: -1 });
  res.json(posts);
});

// GET /posts/:id - Get a single post
router.get("/:id", async (req: Request, res: Response) => {
  const post = await Post.findById(req.params["id"]);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
});

// POST /posts - Create a new post
router.post("/", validate(createPostSchema), async (req: Request, res: Response) => {
  const post = await Post.create(req.body);
  res.status(201).json(post);
});

// PATCH /posts/:id - Update a post
router.patch("/:id", validate(updatePostSchema), async (req: Request, res: Response) => {
  const post = await Post.findByIdAndUpdate(req.params["id"], req.body, {
    returnDocument: "after",
    runValidators: true,
  });

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(post);
});

// DELETE /posts/:id - Delete a post
router.delete("/:id", async (req: Request, res: Response) => {
  const post = await Post.findByIdAndDelete(req.params["id"]);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.status(204).send();
});

export default router;
