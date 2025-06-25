import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    nickname: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please fill a valid email address",
      ],
    },
    password: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
    gender: {
      type: String,
      required: true,
      enum: ["male", "female", "other"],
    },
    subscribe: {
      type: Boolean,
      default: false,
    },
    // Streak tracking (independent from story)
    currentStreak: {
      type: Number,
      default: 0,
    },
    lastJournaled: {
      type: Date,
    },
    longestStreak: {
      type: Number,
      default: 0,
    },
    // Track last visit
    lastVisited: {
      type: Date,
    },
    // New fields for coin system
    coins: {
      type: Number,
      default: 0,
    },
    // Inside userSchema definition
    storyProgress: {
      type: Object,
      default: {
        storyName: null,
        currentChapter: null,
        lastSent: null,
        isComplete: false,
      },
    },
    anonymousName: {
      type: String,
      default: null,
    },
    inventory: {
      type: Array,
      default: () => [
        {
          id: "theme_default",
          name: "Default",
          description: "A simple, no-frills journal theme",
          color: "#cccccc",
          category: "theme",
          isEmoji: false,
          gradient: null,
          price: 0,
          quantity: 1,
        },
      ],
    },
    // New field for active mail theme
    activeMailTheme: {
      type: String,
      default: null,
    },
    // New subscription fields
    subscribers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    subscribedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    subscriberCount: {
      type: Number,
      default: 0,
    },
    // Profile customization
    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },
    // Profile card customization as a single object
    profileTheme: {
      type: Object,
      default: { type: "color", value: "#b6e3f4" },
    },
    // Notification tracking
    lastNotificationCheck: {
      type: Date,
      default: Date.now,
    },

    // saved journals
    savedJournals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Journal",
      },
    ],
    completedEntryMilestones: {
      type: [Number],
      default: [],
    },
    completedStreakMilestones: {
      type: [Number],
      default: [],
    },
    generatedMails: {
      type: [Object],
      default: [],
    },
    agreedToTerms: {
      type: Boolean,
      required: true,
    },
  },
  { timestamps: true }
);

//indexing for fast swiftness niggesh

// For searching users by nickname or email
userSchema.index({ nickname: 1 });
userSchema.index({ email: 1 });

// For login (email lookup)
userSchema.index({ email: 1 }); // already covered by `unique: true`, but explicitly adding is fine

// For sorting users by registration date in the admin dashboard
userSchema.index({ createdAt: -1 });

// For login-based features and weekly summaries
userSchema.index({ lastVisited: -1 });

// For quick filtering or leaderboard use cases
userSchema.index({ coins: -1 });

// For saved journals (get all saved journals of a user)
userSchema.index({ savedJournals: 1 });

// For story progression-based filtering
userSchema.index({ "storyProgress.storyName": 1 });

// For follower/following functionality
userSchema.index({ subscribers: 1 });
userSchema.index({ subscribedTo: 1 });

const User = mongoose.model("User", userSchema);
export default User;
