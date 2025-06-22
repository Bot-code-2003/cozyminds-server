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

    const users = await User.find(query).select("nickname email coins createdAt").sort({ createdAt: -1 });
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
      return res.status(400).json({ message: "User ID and amount are required." });
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
  STREAK_MILESTONES: {
    7: { reward: 50, key: "7day" },
    30: { reward: 150, key: "30day" },
    100: { reward: 300, key: "100day" },
    365: { reward: 1000, key: "365day", special: "Journaling Legend Theme" },
  },
  ENTRY_MILESTONES: {
    10: { reward: 25, key: "10entries" },
    50: { reward: 150, key: "50entries" },
    100: { reward: 250, key: "100entries" },
    365: { reward: 750, key: "365entries", special: "Master Journaler Badge" },
  },
  MOOD_CHECK_MIN_ENTRIES: 3,
  MOOD_EMAIL_COOLDOWN_DAYS: 10,
  WEEKLY_SUMMARY_COOLDOWN_DAYS: 7,
};

// Prompts for weeklySummary
const WEEKLY_PROMPTS = [
  "What moment made you smile this week? 😊",
  "What's something you're grateful for right now? 🙏",
  "What small win deserves celebration? 🎉",
  "What inspired you recently? ✨",
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
  return templates[Math.floor(Math.random() * templates.length)];
};

const getRandomPrompt = () => {
  return WEEKLY_PROMPTS[Math.floor(Math.random() * WEEKLY_PROMPTS.length)];
};

// Handle Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.password !== password) return res.status(401).json({ message: "Incorrect password." });

    // Initialize fields if missing
    user.coins = user.coins ?? 0;
    user.inventory = user.inventory ?? [];
    user.currentStreak = user.currentStreak ?? 0;
    user.completedStreakMilestones = user.completedStreakMilestones ?? [];
    user.completedEntryMilestones = user.completedEntryMilestones ?? [];
    user.activeMailTheme = user.activeMailTheme ?? "default";
    user.lastVisited = user.lastVisited ?? new Date();
    user.storyProgress = user.storyProgress ?? {
      storyName: null,
      currentChapter: null,
      lastSent: null,
      isComplete: false,
    };

    const now = new Date();
    const lastVisited = new Date(user.lastVisited);
    let coinsEarned = 0;

    // Update streak and daily login reward
    if (!lastVisited || lastVisited.toDateString() !== now.toDateString()) {
      const yesterday = new Date(now - 24 * 60 * 60 * 1000);
      user.currentStreak = lastVisited && lastVisited.toDateString() === yesterday.toDateString()
        ? user.currentStreak + 1
        : 1;
      user.longestStreak = Math.max(user.currentStreak, user.longestStreak || 0);
      user.coins += 10;
      coinsEarned += 10;
      user.lastVisited = now;
    }

    // Email automation
    const emailsToSend = [];
    const addMail = (mail) => {
      if (emailsToSend.length < EMAIL_CONFIG.MAX_EMAILS_PER_LOGIN) {
        emailsToSend.push(mail);
      }
    };

    // 1. Streak Milestone Emails
    const streakMilestone = Object.entries(EMAIL_CONFIG.STREAK_MILESTONES).find(
      ([days]) => parseInt(days) === user.currentStreak &&
        !user.completedStreakMilestones.includes(parseInt(days))
    );
    if (streakMilestone) {
      const [days, { key, reward, special }] = streakMilestone;
      const template = getRandomTemplate(mailTemplates.streakMilestone[key]);
      addMail({
        sender: template.sender,
        title: template.title,
        content: template.content,
        recipients: [{ userId: user._id, read: false, rewardClaimed: reward ? false : undefined }],
        mailType: "streak",
        rewardAmount: reward,
        metadata: { milestone: parseInt(days), specialReward: special },
        date: new Date(),
        themeId: user.activeMailTheme,
      });
      user.completedStreakMilestones.push(parseInt(days));
    }

    // 2. Entry Milestone Email
    const entryCount = await Journal.countDocuments({ userId: user._id });
    const entryMilestone = Object.entries(EMAIL_CONFIG.ENTRY_MILESTONES).find(
      ([count]) => parseInt(count) === entryCount &&
        !user.completedEntryMilestones.includes(parseInt(count))
    );
    if (entryMilestone) {
      const [count, { key, reward, special }] = entryMilestone;
      const template = getRandomTemplate(mailTemplates.entryMilestone[key]);
      addMail({
        sender: template.sender,
        title: template.title,
        content: template.content,
        recipients: [{ userId: user._id, read: false, rewardClaimed: reward ? false : undefined }],
        mailType: "milestone",
        rewardAmount: reward,
        metadata: { milestone: parseInt(count), specialReward: special },
        date: new Date(),
        themeId: user.activeMailTheme,
      });
      user.completedEntryMilestones.push(parseInt(count));
    }

    // 3. Mood-Based Email
    const recentMoodMail = await Mail.findOne({
      mailType: "mood",
      "recipients.userId": user._id,
      date: { $gte: getDateDaysAgo(EMAIL_CONFIG.MOOD_EMAIL_COOLDOWN_DAYS) },
    });
    if (!recentMoodMail) {
      const recentEntries = await Journal.find({ userId: user._id })
        .sort({ date: -1 })
        .limit(5);
      if (recentEntries.length >= EMAIL_CONFIG.MOOD_CHECK_MIN_ENTRIES) {
        const moodCounts = recentEntries.reduce((acc, entry) => {
          acc[entry.mood] = (acc[entry.mood] || 0) + 1;
          return acc;
        }, {});
        const dominantMood = Object.entries(moodCounts).reduce(
          (max, [mood, count]) => count > max.count ? { mood, count } : max,
          { mood: null, count: 0 }
        ).mood;
        let moodCategory = "mixed";
        if (["Sad", "Anxious", "Angry"].includes(dominantMood)) {
          moodCategory = "sad";
        } else if (["Happy", "Excited", "Grateful"].includes(dominantMood)) {
          moodCategory = "happy";
        }

        const moodTemplate = getRandomTemplate(mailTemplates.moodBased[moodCategory]);
        addMail({
          sender: moodTemplate.sender,
          title: moodTemplate.title,
          content: moodTemplate.content,
          recipients: [{ userId: user._id, read: false }],
          mailType: "mood",
          moodCategory: moodCategory,
          date: new Date(),
          themeId: user.activeMailTheme,
        });
      }
    }

    // 4. Weekly Summary Email
    if (isFirstLoginOfWeek(lastVisited)) {
      const recentWeeklySummary = await Mail.findOne({
        mailType: "weeklySummary",
        "recipients.userId": user._id,
        date: { $gte: getDateDaysAgo(EMAIL_CONFIG.WEEKLY_SUMMARY_COOLDOWN_DAYS) },
      });
      if (!recentWeeklySummary) {
        const oneWeekAgo = getDateDaysAgo(7);
        const weeklyEntries = await Journal.find({
          userId: user._id,
          date: { $gte: oneWeekAgo },
        });
        if (weeklyEntries.length > 0) {
          const moodCounts = weeklyEntries.reduce((acc, entry) => {
            acc[entry.mood] = (acc[entry.mood] || 0) + 1;
            return acc;
          }, {});
          const mostFrequentMood = Object.entries(moodCounts).reduce(
            (max, [mood, count]) => count > max.count ? { mood, count } : max,
            { mood: "Neutral", count: 0 }
          ).mood;
          const preferredTime = weeklyEntries.reduce((acc, entry) => {
            const hour = new Date(entry.date).getHours();
            acc[hour] = (acc[hour] || 0) + 1;
            return acc;
          }, {});
          const maxHour = Object.entries(preferredTime).reduce(
            (max, [hour, count]) => count > max.count ? { hour: parseInt(hour), count } : max,
            { hour: 0, count: 0 }
          ).hour;
          const timeLabel =
            maxHour >= 5 && maxHour < 12
              ? "morning"
              : maxHour >= 12 && maxHour < 17
              ? "afternoon"
              : maxHour >= 17 && maxHour < 21
              ? "evening"
              : "night";

          const template = getRandomTemplate(mailTemplates.weeklySummary);
          const randomPrompt = getRandomPrompt();
          const content = template.content
            .replace("{entryCount}", weeklyEntries.length.toString())
            .replace("{mostFrequentMood}", mostFrequentMood)
            .replace("{preferredTime}", timeLabel)
            .replace("{randomPrompt}", randomPrompt);
          addMail({
            sender: template.sender,
            title: template.title,
            content: content,
            recipients: [{ userId: user._id, read: false }],
            mailType: "weeklySummary",
            date: new Date(),
            themeId: user.activeMailTheme,
          });
        }
      }
    }

    // 5. Story Delivery Email
    const today = new Date().toDateString();
    const { storyName: userStoryName, currentChapter: userCurrentChapter, lastSent: userLastSent, isComplete } = user.storyProgress || {};
    const lastSentDateString = userLastSent ? new Date(userLastSent).toDateString() : null;
    if (lastSentDateString !== today && userStoryName && !isComplete) {
      const story = storyData.stories?.find((s) => s["Story Name"] === userStoryName);
      if (story && userCurrentChapter <= story.number_of_chapters) {
        const chapterData = story.chapters?.[userCurrentChapter - 1];
        if (chapterData) {
          addMail({
            sender: story.characterSender || "Starlit Journals Team",
            title: `Chapter ${userCurrentChapter}: ${chapterData.title} 📖`,
            content: `<div style="background-image: url('/andy_the_sailor.png'); background-size: cover; background-position: center; opacity: 0.7; padding: 20px; border-radius: 8px; min-height: 200px; display: flex; align-items: center; justify-content: center;">
              <div style="background: rgba(255, 255, 255, 0.9); padding: 15px; border-radius: 6px; max-width: 80%;">
                <h3 style="margin: 0 0 10px 0; color: #333; font-size: 18px;">Chapter ${userCurrentChapter}: ${chapterData.title}</h3>
                <p style="margin: 0; color: #555; line-height: 1.6; white-space: pre-line;">${chapterData.content}</p>
              </div>
            </div>`,
            recipients: [{ userId: user._id, read: false }],
            mailType: "story",
            metadata: { chapter: userCurrentChapter },
            date: new Date(),
            themeId: user.activeMailTheme,
          });
          
          // Check if this is the final chapter
          const isFinalChapter = userCurrentChapter >= story.number_of_chapters;
          
          user.storyProgress = {
            storyName: userStoryName,
            currentChapter: userCurrentChapter + 1,
            lastSent: new Date(),
            isComplete: isFinalChapter,
          };
        }
      }
    }

    // Save user updates and emails
    await user.save();
    if (emailsToSend.length > 0) {
      await Mail.insertMany(emailsToSend);
    }

    res.status(200).json({
      status: 200,
      message: "Login successful!",
      user: user,
      coinsEarned: coinsEarned,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const { nickname, email, password, age, gender, subscribe } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists." });

    const anonymousName = generateAnonymousName(nickname);

    const user = new User({
      nickname,
      email,
      password,
      age,
      gender,
      subscribe,
      coins: 50,
      anonymousName: anonymousName,
      lastVisited: new Date(),
    });
    await user.save();

    // Send welcome and reward emails
    const welcomeTemplate = getRandomTemplate(mailTemplates.welcome);
    const rewardTemplate = getRandomTemplate(mailTemplates.reward);
    
    const emailsToSend = [
      {
        sender: welcomeTemplate.sender,
        title: welcomeTemplate.title,
        content: welcomeTemplate.content,
        recipients: [{ userId: user._id, read: false }],
        mailType: "welcome",
        date: new Date(),
        themeId: user.activeMailTheme,
      },
      {
        sender: rewardTemplate.sender,
        title: rewardTemplate.title,
        content: rewardTemplate.content,
        recipients: [{ userId: user._id, read: false, rewardClaimed: false }],
        mailType: "reward",
        rewardAmount: rewardTemplate.rewardAmount,
        date: new Date(),
        themeId: user.activeMailTheme,
      },
    ];
    
    await Mail.insertMany(emailsToSend);

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
  "Whispering", "Dancing", "Soaring", "Gentle", "Mystic",
  "Radiant", "Serene", "Vibrant", "Cosmic", "Ethereal",
  "Luminous", "Tranquil", "Enchanted", "Harmonious", "Celestial",
  "Dreamy", "Melodic", "Peaceful", "Magical", "Stellar",
  "Wandering", "Floating", "Glowing", "Twinkling", "Breezy",
  "Sparkling", "Misty", "Shimmering", "Drifting", "Gliding",
  "Swaying", "Murmuring", "Rustling", "Swishing", "Sighing",
  "Bubbling", "Gurgling", "Rippling", "Splashing", "Trickling",
  "Humming", "Buzzing", "Chirping", "Singing", "Whistling"
];

const nouns = [
  "Dreamer", "Wanderer", "Explorer", "Seeker", "Traveler",
  "Observer", "Listener", "Thinker", "Creator", "Artist",
  "Poet", "Writer", "Sage", "Mystic", "Visionary",
  "Spirit", "Soul", "Heart", "Mind", "Star",
  "Moon", "Sun", "Cloud", "Wind", "River",
  "Ocean", "Mountain", "Forest", "Garden", "Flower",
  "Tree", "Bird", "Butterfly", "Dragonfly", "Phoenix",
  "Dragon", "Unicorn", "Pegasus", "Griffin", "Angel",
  "Fairy", "Elf", "Dwarf", "Wizard", "Knight",
  "Princess", "Prince", "Queen", "King"
];

const generateAnonymousName = (nickname) => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  const hash = nickname
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;

  return `${adj}${noun}${hash}`;
};

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
    if (activeMailTheme !== undefined) updateData.activeMailTheme = activeMailTheme;
    if (bio !== undefined) updateData.bio = bio;
    if (anonymousName !== undefined) updateData.anonymousName = anonymousName;
    if (storyProgress) updateData.storyProgress = storyProgress;

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
      return res
        .status(400)
        .json({ message: "Password is required." });
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
    await Journal.findByIdAndUpdate(journalId, { $addToSet: { saved: userId } });
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
