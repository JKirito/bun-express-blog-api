import { Post } from "../models/post.ts";
import { NotFoundError, ConflictError, BadRequestError } from "../errors/index.ts";
import { saveVersion } from "./version.service.ts";

const MIN_PUBLISH_CONTENT_LENGTH = 50;

export async function getPublishedPosts(tag?: string) {
  const filter: Record<string, unknown> = { status: "published" };

  if (tag) {
    filter.tags = tag.toLowerCase();
  }

  return Post.find(filter).sort({ createdAt: -1 });
}

export async function getPopularTags(limit = 10) {
  return Post.aggregate([
    { $match: { status: "published" } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, tag: "$_id", count: 1 } },
  ]);
}

export async function publishPost(id: string) {
  const post = await Post.findById(id);

  if (!post) {
    throw new NotFoundError("Post not found");
  }

  if (post.status === "published") {
    throw new ConflictError("Post is already published");
  }

  if (post.content.length < MIN_PUBLISH_CONTENT_LENGTH) {
    throw new BadRequestError(
      `Content must be at least ${MIN_PUBLISH_CONTENT_LENGTH} characters to publish (currently ${post.content.length})`
    );
  }

  post.status = "published";
  await post.save();

  return post;
}

export async function updatePost(id: string, updates: Record<string, unknown>) {
  const post = await Post.findById(id);

  if (!post) {
    throw new NotFoundError("Post not found");
  }

  // Determine which fields are actually changing
  const changedFields: string[] = [];
  for (const key of Object.keys(updates)) {
    const currentVal = key === "tags" ? JSON.stringify(post.get(key)) : String(post.get(key));
    const newVal = key === "tags" ? JSON.stringify(updates[key]) : String(updates[key]);
    if (currentVal !== newVal) {
      changedFields.push(key);
    }
  }

  // Only create a version if something actually changed
  if (changedFields.length > 0) {
    // Snapshot current state before applying edit
    const snapshot = {
      title: post.title,
      content: post.content,
      author: post.author,
      tags: post.tags as string[],
    };

    // Apply the updates
    post.set(updates);
    await post.save();

    // Save the pre-edit snapshot as a version (Option B: save after successful update)
    const newVersion = await saveVersion(id, snapshot, changedFields);
    post.currentVersion = newVersion;
  }

  return post;
}
