import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Mail from "../models/Mail.js";
import Journal from "../models/Journal.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mailTemplatesPath = join(__dirname, "mailTemplates.json");
const storyPath = join(__dirname, "stories.json");
const storyData = JSON.parse(readFileSync(storyPath, "utf-8"));
const mailTemplates = JSON.parse(readFileSync(mailTemplatesPath, "utf-8"));

const router = express.Router();

// --- Admin Routes for SiteMaster ---

// Get all users with optional search
router.get("/users", async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      const searchRegex = new RegExp(search, "i"); // Case-insensitive search
      query = {
        $or: [{ nickname: searchRegex }, { email: searchRegex }],
      };
    }

    const users = await User.find(query)
      .select("nickname email coins createdAt")
      .sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Grant coins to a user
router.post("/users/grant-coins", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res
        .status(400)
        .json({ message: "User ID and amount are required." });
    }

    const amountNum = parseInt(amount, 10);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ message: "Invalid amount specified." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.coins = (user.coins || 0) + amountNum;
    await user.save();

    res.status(200).json({
      message: `Successfully granted ${amountNum} coins to ${user.nickname}.`,
      user,
    });
  } catch (error) {
    console.error("Error granting coins:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Configuration for email automation
const EMAIL_CONFIG = {
  MAX_EMAILS_PER_LOGIN: 2,
};

// Prompts for weeklySummary
const WEEKLY_PROMPTS = [
  "What moment made you smile this week? 😊",
  "What's something you're grateful for right now? 🙏",
  "What small win deserves celebration? 🎉",
  "What's inspired you recently? ✨",
  "What's a goal for next week? 🚀",
];

// Helper functions
const getDateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const isFirstLoginOfWeek = (lastVisited) => {
  if (!lastVisited) return true;
  const now = new Date();
  const lastDate = new Date(lastVisited);
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  return lastDate.getTime() <= oneWeekAgo.getTime() || now.getDay() === 1; // Monday or >7 days
};

const getRandomTemplate = (templates) => {
  if (!Array.isArray(templates) || templates.length === 0) return null;
  return templates[Math.floor(Math.random() * templates.length)];
};

const getRandomPrompt = () => {
  return WEEKLY_PROMPTS[Math.floor(Math.random() * WEEKLY_PROMPTS.length)];
};

// Helper to get ISO week number
function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNum;
}

// Handle Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    // Validate user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.password !== password)
      return res.status(401).json({ message: "Incorrect password." });

    // Initialize fields if missing
    user.coins = user.coins ?? 0;
    user.inventory = user.inventory ?? [];
    user.activeMailTheme = user.activeMailTheme ?? "default";
    user.lastVisited = user.lastVisited ?? new Date();

    const now = new Date();
    const lastVisited = new Date(user.lastVisited);
    let coinsEarned = 0;

    // Daily login reward (keep if you want daily coins)
    if (!lastVisited || lastVisited.toDateString() !== now.toDateString()) {
      user.coins += 10;
      coinsEarned += 10;
      user.lastVisited = now;
    }

    // Notification logic (likeNotification, commentNotification) can go here if needed
    // Example:
    // const emailsToSend = [];
    // const addMail = (mail) => {
    //   if (emailsToSend.length < EMAIL_CONFIG.MAX_EMAILS_PER_LOGIN) {
    //     emailsToSend.push(mail);
    //   }
    // };

    await user.save();
    res.status(200).json({
      message: "Login successful.",
      user,
      coinsEarned,
      // emailsToSend
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Add helper to pick deterministic avatar style
const avatarStyles = [
  "avataaars",
  "bottts",
  "funEmoji",
  "miniavs",
  "croodles",
  "micah",
  "pixelArt",
  "adventurer",
  "bigEars",
  "bigSmile",
  "lorelei",
  "openPeeps",
  "personas",
  "rings",
  "shapes",
  "thumbs",
];
function getDeterministicAvatarStyle(seed) {
  if (!seed) return avatarStyles[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return avatarStyles[Math.abs(hash) % avatarStyles.length];
}

router.post("/signup", async (req, res) => {
  try {
    const { nickname, email, password, age, gender, subscribe, agreedToTerms } =
      req.body;

    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }

    // Generate anonymous details
    const anonymousName = generateAnonymousName(nickname);
    const avatarStyle = getDeterministicAvatarStyle(anonymousName);

    // Create new user
    const user = new User({
      nickname,
      email,
      password,
      age,
      gender,
      subscribe,
      agreedToTerms,
      coins: 50,
      anonymousName,
      lastVisited: new Date(),
      profileTheme: { avatarStyle },
    });

    await user.save();

    // Send welcome mail only
    const welcomeTemplate = getRandomTemplate(mailTemplates.welcome);

    if (!welcomeTemplate) {
      return res.status(500).json({
        message: "Server Error",
        error: "Welcome mail template not found.",
      });
    }

    const welcomeMail = {
      sender: welcomeTemplate.sender,
      title: welcomeTemplate.title,
      content: welcomeTemplate.content,
      recipients: [{ userId: user._id, read: false }],
      mailType: "welcome",
      date: new Date(),
      themeId: user.activeMailTheme,
    };

    await Mail.insertMany([welcomeMail]);

    res.status(201).json({ message: "User created successfully!", user });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

function applyMailTheme(content, themeId) {
  const theme = mailTemplates.mailThemes?.[themeId];
  if (!theme) return content;

  // Build inline styles
  const styles = theme.styles
    ? Object.entries(theme.styles)
        .map(
          ([key, value]) =>
            `${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value}`
        )
        .join("; ")
    : "";

  // Get random prefix/suffix if arrays are present
  const getRandomFromArray = (arr) =>
    Array.isArray(arr) && arr.length > 0
      ? arr[Math.floor(Math.random() * arr.length)]
      : "";

  const contentPrefix = getRandomFromArray(theme.contentPrefixes || []);
  const contentSuffix = getRandomFromArray(theme.contentSuffixes || []);

  // Wrap content
  return `<div style="${styles}">
    ${contentPrefix}
    ${content}
    ${contentSuffix}
  </div>`;
}

// Anonymous name generator
const adjectives = [
  "Whispering",
  "Dancing",
  "Soaring",
  "Gentle",
  "Mystic",
  "Radiant",
  "Serene",
  "Vibrant",
  "Cosmic",
  "Ethereal",
  "Luminous",
  "Tranquil",
  "Enchanted",
  "Harmonious",
  "Celestial",
  "Dreamy",
  "Melodic",
  "Peaceful",
  "Magical",
  "Stellar",
  "Wandering",
  "Floating",
  "Glowing",
  "Twinkling",
  "Breezy",
  "Sparkling",
  "Misty",
  "Shimmering",
  "Drifting",
  "Gliding",
  "Swaying",
  "Murmuring",
  "Rustling",
  "Swishing",
  "Sighing",
  "Bubbling",
  "Gurgling",
  "Rippling",
  "Splashing",
  "Trickling",
  "Humming",
  "Buzzing",
  "Chirping",
  "Singing",
  "Whistling",
  // New additions
  "Brave",
  "Curious",
  "Playful",
  "Cheerful",
  "Bold",
  "Clever",
  "Kind",
  "Hopeful",
  "Joyful",
  "Radiant",
  "Sunny",
  "Blissful",
  "Dazzling",
  "Gallant",
  "Noble",
  "Gentle",
  "Lively",
  "Merry",
  "Patient",
  "Resilient",
  "Wise",
  "Zesty",
  "Charming",
  "Daring",
  "Inventive",
  "Loyal",
  "Mirthful",
  "Optimistic",
  "Resourceful",
  "Valiant",
];

const nouns = [
  "Dreamer",
  "Wanderer",
  "Explorer",
  "Seeker",
  "Traveler",
  "Observer",
  "Listener",
  "Thinker",
  "Creator",
  "Artist",
  "Poet",
  "Writer",
  "Sage",
  "Mystic",
  "Visionary",
  "Spirit",
  "Soul",
  "Heart",
  "Mind",
  "Star",
  "Moon",
  "Sun",
  "Cloud",
  "Wind",
  "River",
  "Ocean",
  "Mountain",
  "Forest",
  "Garden",
  "Flower",
  "Tree",
  "Bird",
  "Butterfly",
  "Dragonfly",
  "Phoenix",
  "Dragon",
  "Unicorn",
  "Pegasus",
  "Griffin",
  "Angel",
  "Fairy",
  "Elf",
  "Dwarf",
  "Wizard",
  "Knight",
  "Princess",
  "Prince",
  "Queen",
  "King",
  // New additions
  "Scholar",
  "Guardian",
  "Healer",
  "Inventor",
  "Jester",
  "Muse",
  "Oracle",
  "Paladin",
  "Ranger",
  "Scribe",
  "Sculptor",
  "Sailor",
  "Captain",
  "Pilot",
  "Gardener",
  "Chef",
  "Baker",
  "Composer",
  "Dancer",
  "Singer",
  "Painter",
  "Magician",
  "Alchemist",
  "Merchant",
  "Scribe",
  "Adventurer",
  "Champion",
  "Friend",
  "Guide",
  "Hero",
];

// simple consistent hash
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000000007;
  }
  return hash >>> 0; // force positive
}

function generateAnonymousName(nickname, password) {
  const clean = nickname.toLowerCase().replace(/[^a-z0-9]/g, "");
  const combined = clean + password;

  const hashed = simpleHash(combined);

  const adjIndex = hashed % adjectives.length;
  const nounIndex = (hashed >> 8) % nouns.length;
  const suffix = (hashed % 10000).toString().padStart(4, "0");

  return `${adjectives[adjIndex]}${nouns[nounIndex]}${suffix}`;
}

// Get user data
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Find the user
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ user: user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update user profile
router.put("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nickname,
      email,
      age,
      gender,
      subscribe,
      currentStreak,
      longestStreak,
      lastJournaled,
      coins,
      inventory,
      lastVisited,
      activeMailTheme,
      bio,
      anonymousName,
      storyProgress,
      profileTheme,
    } = req.body;

    // console.log(req.body);

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if email is already in use by another user
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: id } });
      if (existingUser) {
        return res
          .status(409)
          .json({ message: "Email already in use by another account." });
      }
    }

    // Create update object with only provided fields
    const updateData = {};
    if (nickname) updateData.nickname = nickname;
    if (email) updateData.email = email;
    if (age) updateData.age = age;
    if (gender) updateData.gender = gender;
    if (subscribe !== undefined) updateData.subscribe = subscribe;
    if (currentStreak !== undefined) updateData.currentStreak = currentStreak;
    if (longestStreak !== undefined) updateData.longestStreak = longestStreak;
    if (lastJournaled) updateData.lastJournaled = lastJournaled;
    if (coins !== undefined) updateData.coins = coins;
    if (inventory) updateData.inventory = inventory;
    if (lastVisited) updateData.lastVisited = lastVisited;
    if (activeMailTheme !== undefined)
      updateData.activeMailTheme = activeMailTheme;
    if (bio !== undefined) updateData.bio = bio;
    if (anonymousName !== undefined) updateData.anonymousName = anonymousName;
    if (storyProgress) updateData.storyProgress = storyProgress;
    if (profileTheme !== undefined) updateData.profileTheme = profileTheme;

    // Find and update the user
    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Profile updated successfully!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update user password
router.put("/user/:id/password", async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Validate password (no minimum length)
    if (!newPassword) {
      return res.status(400).json({ message: "Password is required." });
    }

    // Find and update the user's password
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { password: newPassword },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Password updated successfully!",
    });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Verify user password
router.post("/verify-password", async (req, res) => {
  try {
    const { userId, password } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Find the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Verify password
    const isValid = user.password === password;

    res.status(200).json({ valid: isValid });
  } catch (error) {
    console.error("Error verifying password:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Delete user account
router.delete("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Delete all user's journal entries
    await Journal.deleteMany({ userId: id });

    // Delete the user
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Account deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get a user's saved journals (paginated)
router.get("/users/:userId/saved-journals", async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId).populate({
      path: "savedJournals",
      options: { sort: { date: -1 }, skip, limit },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const total = user.savedJournals.length;
    const journals = user.savedJournals;
    const hasMore = total > page * limit;

    res.json({ journals, hasMore });
  } catch (err) {
    console.error("Error fetching saved journals:", err);
    res.status(500).json({ message: "Failed to fetch saved journals" });
  }
});

// Save a journal for a user
router.post("/users/:userId/save-journal", async (req, res) => {
  try {
    const { userId } = req.params;
    const { journalId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.savedJournals.includes(journalId)) {
      user.savedJournals.push(journalId);
      await user.save();
    }
    // Also add userId to the journal's saved array
    const Journal = (await import("../models/Journal.js")).default;
    await Journal.findByIdAndUpdate(journalId, {
      $addToSet: { saved: userId },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving journal:", err);
    res.status(500).json({ message: "Failed to save journal" });
  }
});

// Unsave a journal for a user
router.post("/users/:userId/unsave-journal", async (req, res) => {
  try {
    const { userId } = req.params;
    const { journalId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.savedJournals = user.savedJournals.filter(
      (id) => id.toString() !== journalId
    );
    await user.save();
    // Also remove userId from the journal's saved array
    const Journal = (await import("../models/Journal.js")).default;
    await Journal.findByIdAndUpdate(journalId, { $pull: { saved: userId } });
    res.json({ success: true });
  } catch (err) {
    console.error("Error unsaving journal:", err);
    res.status(500).json({ message: "Failed to unsave journal" });
  }
});

export default router;
