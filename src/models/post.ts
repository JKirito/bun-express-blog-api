import mongoose, { Schema, type InferRawDocType } from "mongoose";

const postSchemaDefinition = {
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: String, required: true },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  tags: { type: [String], default: [] },
} as const;

const postSchema = new Schema(postSchemaDefinition, { timestamps: true });

export type IPost = InferRawDocType<typeof postSchemaDefinition>;
export const Post = mongoose.model("Post", postSchema);
