import * as z from "zod";

const tagsSchema = z
  .array(z.string().min(1, "tag cannot be empty").max(50, "tag must be 50 characters or less"))
  .max(10, "a post can have at most 10 tags")
  .transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()))])
  .optional()
  .default([]);

export const createPostSchema = z.object({
  title: z.string().min(1, "title is required").max(200, "title must be 200 characters or less"),
  content: z.string().min(1, "content is required"),
  author: z.string().min(1, "author is required").max(100, "author must be 100 characters or less"),
  tags: tagsSchema,
});

export const updatePostSchema = z.object({
  title: z.string().min(1, "title cannot be empty").max(200, "title must be 200 characters or less").optional(),
  content: z.string().min(1, "content cannot be empty").optional(),
  author: z.string().min(1, "author cannot be empty").max(100, "author must be 100 characters or less").optional(),
  tags: tagsSchema,
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
