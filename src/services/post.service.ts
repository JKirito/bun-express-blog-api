import { Post } from "../models/post.ts";
import { NotFoundError, ConflictError, BadRequestError } from "../errors/index.ts";

const MIN_PUBLISH_CONTENT_LENGTH = 50;

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
