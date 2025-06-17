import mongoose from "mongoose";

const mailSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    default: "Developer",
  },
  title: {
    type: String,
    required: true,
    default: "Welcome to Starlit Journals",
  },
  content: {
    type: String,
    required: true,
    default: `Welcome to Starlit Journals!`,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  recipients: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      read: {
        type: Boolean,
        default: false,
      },
      rewardClaimed: {
        type: Boolean,
        default: false,
      },
    },
  ],
  mailType: {
    type: String,
    enum: [
      "welcome",
      "reward",
      "other",
      "mood",
      "entry",
      "inactivity",
      "summary",
      "seasonal",
      "tip",
      "prompt",
      "story",
    ],
    default: "welcome",
  },
  rewardAmount: {
    type: Number,
    default: 0,
  },
  themeId: {
    type: String,
    default: null,
  },
  moodCategory: {
    type: String,
    default: null,
  },
  metadata: {
    type: Object,
    default: {},
  },
});

const Mail = mongoose.model("Mail", mailSchema);
export default Mail;
