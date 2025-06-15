import mongoose from "mongoose";

const journalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    mood: {
      type: String,
      enum: [
        "Happy",
        "Neutral",
        "Sad",
        "Angry",
        "Anxious",
        "Tired",
        "Reflective",
        "Excited",
      ],
      required: true,
    },
    tags: [
      {
        type: String,
        required: true,
      },
    ],
    collections: {
      type: [String],
      default: ["All"], // Always include 'All'
      required: true,
    },
    wordCount: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    // Add theme field to journal entries
    theme: {
      type: String,
      default: null,
    },
    // Add privacy field
    isPublic: {
      type: Boolean,
      default: false,
    },
    // Add likes array
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
    // Add author name for public journals
    authorName: {
      type: String,
      required: function () {
        return this.isPublic;
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
journalSchema.index({ userId: 1, date: -1 });
journalSchema.index({ isPublic: 1, date: -1 });
journalSchema.index({ slug: 1 });

const Journal = mongoose.model("Journal", journalSchema);
export default Journal;
