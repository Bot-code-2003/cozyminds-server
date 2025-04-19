import mongoose from "mongoose";

const journalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
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
});

const Journal = mongoose.model("Journal", journalSchema);
export default Journal;
