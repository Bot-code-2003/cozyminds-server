import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    journalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Journal",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    authorName: {
      type: String,
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likeCount: {
      type: Number,
      default: 0,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
commentSchema.index({ journalId: 1, createdAt: -1 });
commentSchema.index({ parentId: 1 });

const Comment = mongoose.model("Comment", commentSchema);
export default Comment;
