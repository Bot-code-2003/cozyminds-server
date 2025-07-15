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
    // Remove mood field
    // mood: {
    //   type: String,
    //   default: "Neutral",
    //   required: true,
    // },
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
    // Add saved array for users who saved this journal
    saved: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Add author name for public journals
    authorName: {
      type: String,
      required: function () {
        return this.isPublic;
      },
    },
    // Add thumbnail field for journal entries
    thumbnail: {
      type: String,
      default: null,
    },
    // Add category enum
    category: {
      type: String,
      enum: ["story", "journal"],
      default: "journal",
      required: true,
    },
    // Optional meta description for stories (SEO)
    metaDescription: {
      type: String,
      default: null,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  }
);

// Already present
journalSchema.index({ userId: 1, date: -1 });
journalSchema.index({ isPublic: 1, date: -1 });

// 🔥 Strongly Recommended for performance
journalSchema.index({ userId: 1, isPublic: 1, createdAt: -1 }); // for dashboard routes
journalSchema.index({ tags: 1, isPublic: 1 }); // for tag searches
journalSchema.index({ collections: 1, userId: 1 }); // for collection filtering
journalSchema.index({ saved: 1 }); // for saved journal queries
journalSchema.index({ likeCount: -1, createdAt: -1 }); // for trending, top, etc.

// ⚠️ Optional
journalSchema.index({ authorName: 1 }); // used in popular writers

const Journal = mongoose.model("Journal", journalSchema);
export default Journal;
