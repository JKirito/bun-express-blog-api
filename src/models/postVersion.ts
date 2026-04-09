import mongoose, { Schema } from "mongoose";

const postVersionSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, ref: "Post", required: true, index: true },
  version: { type: Number, required: true },
  snapshot: {
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: String, required: true },
    tags: { type: [String], default: [] },
  },
  changedFields: { type: [String], required: true },
  changedAt: { type: Date, default: Date.now },
});

// Compound index for efficient queries: get history for a post, sorted by version
postVersionSchema.index({ postId: 1, version: -1 });

export const PostVersion = mongoose.model("PostVersion", postVersionSchema);
