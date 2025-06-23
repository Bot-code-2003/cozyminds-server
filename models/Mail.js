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
  expiryDate: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days default expiry
  },
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
      "streak",
      "weeklySummary",
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
  recipients: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    rewardClaimed: {
      type: Boolean,
      default: false
    },
    receivedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isSystemMail: {
    type: Boolean,
    default: false
  },
  sendToAllUsers: {
    type: Boolean,
    default: false
  }
});

mailSchema.index({ date: -1 });
mailSchema.index({ mailType: 1 });
mailSchema.index({ 'recipients.userId': 1 });
mailSchema.index({ expiryDate: 1 });
mailSchema.index({ isSystemMail: 1 });
mailSchema.index({ sendToAllUsers: 1 });

const Mail = mongoose.model("Mail", mailSchema);
export default Mail;
