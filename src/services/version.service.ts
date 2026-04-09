import { Post } from "../models/post.ts";
import { PostVersion } from "../models/postVersion.ts";
import { NotFoundError, BadRequestError } from "../errors/index.ts";

const MAX_VERSIONS = 50;

/**
 * Save a snapshot of the current post state before an edit.
 * Returns the new version number.
 */
export async function saveVersion(
  postId: string,
  snapshot: { title: string; content: string; author: string; tags: string[] },
  changedFields: string[]
): Promise<number> {
  const post = await Post.findById(postId);
  if (!post) {
    throw new NotFoundError("Post not found");
  }

  const newVersion = post.currentVersion + 1;

  await PostVersion.create({
    postId,
    version: newVersion,
    snapshot,
    changedFields,
  });

  post.currentVersion = newVersion;
  await post.save();

  // Prune old versions if over the limit
  await pruneOldVersions(postId);

  return newVersion;
}

/**
 * Get the edit history for a post, newest version first.
 */
export async function getHistory(postId: string) {
  const post = await Post.findById(postId);
  if (!post) {
    throw new NotFoundError("Post not found");
  }

  return PostVersion.find({ postId }).sort({ version: -1 });
}

/**
 * Rollback a post to a specific version.
 * This creates a new version (the rollback itself is recorded in history).
 */
export async function rollbackPost(postId: string, targetVersion: number) {
  const post = await Post.findById(postId);
  if (!post) {
    throw new NotFoundError("Post not found");
  }

  if (targetVersion < 1) {
    throw new BadRequestError("Cannot rollback to version 0 (original creation)");
  }

  if (targetVersion > post.currentVersion) {
    throw new NotFoundError(`Version ${targetVersion} not found`);
  }

  const version = await PostVersion.findOne({ postId, version: targetVersion });
  if (!version) {
    throw new NotFoundError(`Version ${targetVersion} not found`);
  }

  // Snapshot current state before rollback (so the rollback itself is versioned)
  const currentSnapshot = {
    title: post.title,
    content: post.content,
    author: post.author,
    tags: post.tags as string[],
  };

  const changedFields = [];
  if (post.title !== version.snapshot.title) changedFields.push("title");
  if (post.content !== version.snapshot.content) changedFields.push("content");
  if (post.author !== version.snapshot.author) changedFields.push("author");
  if (JSON.stringify(post.tags) !== JSON.stringify(version.snapshot.tags)) changedFields.push("tags");

  const newVersion = post.currentVersion + 1;

  // Save the current state as a version before restoring
  await PostVersion.create({
    postId,
    version: newVersion,
    snapshot: currentSnapshot,
    changedFields,
  });

  // Restore the post to the target version's snapshot
  post.title = version.snapshot.title;
  post.content = version.snapshot.content;
  post.author = version.snapshot.author;
  post.tags = version.snapshot.tags;
  post.currentVersion = newVersion;
  // Status is preserved (published stays published)
  await post.save();

  await pruneOldVersions(postId);

  return post;
}

/**
 * Remove oldest versions if a post exceeds MAX_VERSIONS.
 */
async function pruneOldVersions(postId: string): Promise<void> {
  const count = await PostVersion.countDocuments({ postId });

  if (count > MAX_VERSIONS) {
    // Find the oldest versions that exceed the cap
    const toDelete = await PostVersion.find({ postId })
      .sort({ version: 1 })
      .limit(count - MAX_VERSIONS)
      .select("_id");

    const ids = toDelete.map((doc) => doc._id);
    await PostVersion.deleteMany({ _id: { $in: ids } });
  }
}
