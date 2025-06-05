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
        currentChapter: 1,
        lastSent: null,
        storyName: "Andy the Sailor",
      },
    },

    inventory: {
      type: Array,
      default: () => [
        {
          id: "theme_default",
          name: "Default",
          description: "A simple, no-frills journal theme",
          color: "#cccccc", // a plain gray
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
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
