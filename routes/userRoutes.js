// userRoutes.js
import express from "express";
import User from "../models/User.js";
import Mail from "../models/Mail.js";
import Journal from "../models/Journal.js"; // Import Journal model
// import mailTemplates from "./mailTemplates.json" assert { type: "json" };
import mongoose from "mongoose";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Required in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Build the path to the JSON file in the same folder
const mailTemplatesPath = join(__dirname, "mailTemplates.json");
const storyPath = join(__dirname, "stories.json");
const storyData = JSON.parse(readFileSync(storyPath, "utf-8"));
const mailTemplates = JSON.parse(readFileSync(mailTemplatesPath, "utf-8"));

const router = express.Router();

// Helper function to get date X days ago
const getDateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

// Helper to check if it's the first login of the week
const isFirstLoginOfWeek = (lastVisited) => {
  if (!lastVisited) return true;

  const now = new Date();
  const lastDate = new Date(lastVisited);

  // Get the day of the week (0 = Sunday, 1 = Monday, etc.)
  const today = now.getDay();
  const lastDay = lastDate.getDay();

  // If today is Monday (1) and last visit was before Monday
  if (
    today === 1 &&
    (lastDay !== 1 || now.toDateString() !== lastDate.toDateString())
  ) {
    return true;
  }

  // If last visit was more than 7 days ago
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  return lastDate < oneWeekAgo;
};

// Helper function to get a random template from an array
const getRandomTemplate = (templates) => {
  // console.log(templates);
  return templates[Math.floor(Math.random() * templates.length)];
};

// Helper function to get a random writing prompt
const getRandomPrompt = () => {
  return getRandomTemplate(mailTemplates.writingPrompts);
};

// Helper function to check if it's a special date (holiday, etc.)
const getSpecialDate = () => {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Check for special dates
  if (month === 1 && day === 1) return "newYear";
  if (month === 2 && day === 14) return "valentines";
  if (month === 10 && day === 31) return "halloween";
  if (month === 12 && day >= 24 && day <= 26) return "christmas";
  if (month === 12 && day === 31) return "newYearsEve";

  // Check for seasons (Northern Hemisphere)
  if (month === 3 && day >= 20) return "spring";
  if (month === 6 && day >= 20) return "summer";
  if (month === 9 && day >= 22) return "autumn";
  if (month === 12 && day >= 21) return "winter";
  if (month === 1 || month === 2 || (month === 3 && day < 20)) return "winter";
  if (month === 4 || month === 5 || (month === 6 && day < 20)) return "spring";
  if (month === 7 || month === 8 || (month === 9 && day < 22)) return "summer";
  if (month === 10 || month === 11 || (month === 12 && day < 21))
    return "autumn";

  return null;
};

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


// Handle Signup
router.post("/signup", async (req, res) => {
  try {
    const { nickname, email, password, age, gender, subscribe } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const anonymousName = generateAnonymousName(nickname);
    

    // Save new user with initial coins
    const newUser = new User({
      nickname,
      email,
      password,
      age,
      gender,
      subscribe,
      lastVisited: new Date(),
      coins: 0,
      activeMailTheme: null,
      anonymousName: anonymousName,
    });


    await newUser.save();

    // Check for special date mail
    const specialDate = getSpecialDate();
    let specialMail = null;

    if (
      specialDate &&
      mailTemplates.seasonal &&
      mailTemplates.seasonal[specialDate]
    ) {
      const seasonalTemplate = getRandomTemplate(
        mailTemplates.seasonal[specialDate]
      );
      specialMail = new Mail({
        sender: seasonalTemplate.sender,
        title: seasonalTemplate.title,
        content: seasonalTemplate.content,
        recipients: [{ userId: newUser._id, read: false }],
        mailType: "seasonal",
      });
    }

    // Get random reward template
    const rewardTemplate = getRandomTemplate(mailTemplates.reward);

    // Create reward mail
    const rewardMail = new Mail({
      sender: rewardTemplate.sender,
      title: rewardTemplate.title,
      content: rewardTemplate.content,
      recipients: [{ userId: newUser._id, read: false, rewardClaimed: false }],
      mailType: "reward",
      rewardAmount: rewardTemplate.rewardAmount,
    });

    // Get random welcome template
    const welcomeTemplate = getRandomTemplate(mailTemplates.welcome);

    // Create welcome mail
    const welcomeMail = new Mail({
      sender: welcomeTemplate.sender,
      title: welcomeTemplate.title,
      content: welcomeTemplate.content,
      recipients: [{ userId: newUser._id, read: false }],
      mailType: "welcome",
    });

    // Create story promotion mail
    const storyMail = new Mail({
      sender: "Andy the Sailor",
      title: "Claim Your Free Story Chapter!",
      content: `
<div style="background-image: url('/andy_the_sailor.png'); background-size: cover; background-position: center; padding: 20px; border-radius: 8px; color: #ffffff; text-align: center; position: relative; min-height: 400px;">  <div style="background-color: rgba(26, 32, 44, 0.8); padding: 15px; border-radius: 8px;">
    <p style="margin: 0 0 15px; font-size: 16px;">Hi ${nickname},</p>
    <p style="margin: 0 0 15px; font-size: 16px;">Join Andy's *Moonwake Adventures* for free! Claim your first chapter in our Cozy Shop.</p>
    <a href="/cozyshop" style="display: inline-block; padding: 10px 20px; background-color: #1a202c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">Claim Your First Chapter Free</a>
  </div>
</div>
      `,
      recipients: [{ userId: newUser._id, read: false }],
      mailType: "story",
    });

    // Save all mails
    const mailsToSave = [welcomeMail, rewardMail, storyMail];
    if (specialMail) mailsToSave.push(specialMail);

    await Promise.all(mailsToSave.map((mail) => mail.save()));

    res.status(201).json({ message: "Signup successful!", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Handle Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Validate password (consider hashing in production)
    if (user.password !== password) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    // Initialize fields if missing
    if (user.coins === undefined) user.coins = 0;
    if (!user.inventory) user.inventory = [];
    if (user.currentStreak === undefined) user.currentStreak = 0;
    if (user.activeMailTheme === undefined) user.activeMailTheme = null;

    const now = new Date();
    const lastVisited = user.lastVisited ? new Date(user.lastVisited) : null;
    let coinsEarned = 0;
    const streakBonus = 0;

    // If it's a new day
    if (!lastVisited || lastVisited.toDateString() !== now.toDateString()) {
      // Check if yesterday was the last visit
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      if (
        lastVisited &&
        lastVisited.toDateString() === yesterday.toDateString()
      ) {
        user.currentStreak += 1;
      } else {
        user.currentStreak = 1; // Reset streak if not continuous
      }

      // Update longest streak
      if (user.currentStreak > user.longestStreak) {
        user.longestStreak = user.currentStreak;
      }

      // Base login reward
      user.coins += 10;
      coinsEarned += 10;

      user.lastVisited = now;
      await user.save();
    }

    // ===== MAIL AUTOMATION LOGIC =====
    const mailsToSend = [];

    // 1. MOOD-BASED MAIL - Simplified to directly check entry.mood
    try {
      const recentEntries = await Journal.find({ userId: user._id })
        .sort({ date: -1 })
        .limit(5);

      if (recentEntries.length >= 3) {
        const moodCounts = {};
        recentEntries.forEach((entry) => {
          // Directly use entry.mood without extraction
          moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
        });

        // Categorize moods
        const sadMoods =
          (moodCounts["Sad"] || 0) +
          (moodCounts["Anxious"] || 0) +
          (moodCounts["Angry"] || 0) +
          (moodCounts["Stressed"] || 0) +
          (moodCounts["Overwhelmed"] || 0);

        const happyMoods =
          (moodCounts["Happy"] || 0) +
          (moodCounts["Excited"] || 0) +
          (moodCounts["Grateful"] || 0) +
          (moodCounts["Peaceful"] || 0) +
          (moodCounts["Content"] || 0);

        const neutralMoods =
          (moodCounts["Neutral"] || 0) +
          (moodCounts["Calm"] || 0) +
          (moodCounts["Reflective"] || 0);

        // Get the specific dominant mood for more targeted messages
        let dominantMood = null;
        let maxCount = 0;

        for (const [mood, count] of Object.entries(moodCounts)) {
          if (count > maxCount) {
            dominantMood = mood;
            maxCount = count;
          }
        }

        // Select appropriate template category
        let moodTemplates;
        let moodCategory;

        if (sadMoods >= 2) {
          moodTemplates = mailTemplates.moodBased.sad;
          moodCategory = "sad";
        } else if (happyMoods >= 2) {
          moodTemplates = mailTemplates.moodBased.happy;
          moodCategory = "happy";
        } else {
          moodTemplates = mailTemplates.moodBased.mixed;
          moodCategory = "mixed";
        }

        // Check for specific mood templates if available
        if (
          dominantMood &&
          mailTemplates.specificMoods &&
          mailTemplates.specificMoods[dominantMood.toLowerCase()]
        ) {
          moodTemplates =
            mailTemplates.specificMoods[dominantMood.toLowerCase()];
          moodCategory = dominantMood.toLowerCase();
        }

        const moodTemplate = getRandomTemplate(moodTemplates);

        // Apply mail theme if user has one active
        let content = moodTemplate.content;
        if (user.activeMailTheme) {
          content = applyMailTheme(content, user.activeMailTheme);
        }

        // Check if we've sent a similar mood mail recently
        const recentMoodMail = await Mail.findOne({
          "recipients.userId": user._id,
          mailType: "mood",
          date: { $gte: getDateDaysAgo(5) },
        });

        if (!recentMoodMail) {
          mailsToSend.push({
            sender: moodTemplate.sender,
            title: moodTemplate.title,
            content: content,
            recipients: [{ userId: user._id, read: false }],
            mailType: "mood",
            moodCategory: moodCategory,
            date: new Date(),
            themeId: user.activeMailTheme,
          });
        }
      }
    } catch (error) {
      console.error("Error generating mood mail:", error);
    }

    // 2. STREAK MILESTONE MAILS
    try {
      if (user.currentStreak === 4) {
        const alreadySent = await Mail.findOne({
          "recipients.userId": user._id,
          mailType: "reward",
          "metadata.milestone": 3,
        });

        if (!alreadySent) {
          const feedbackContent = `
            <div style=\"padding: 1.25rem; background: linear-gradient(to bottom, #ffe6f0, #fff0f5); border: 1px solid #f9a8d4; border-radius: 8px; box-shadow: inset 0 0 4px rgba(249, 168, 212, 0.3); color: #a64d79; font-family: 'Comic Neue', 'Segoe UI', cursive; margin: 0 auto; text-align: center;\">
              <h2 style=\"font-size: 1.4rem; margin-bottom: 0.75rem;\">3 Days of Cozy Vibes! 💖</h2>
              <p style=\"font-size: 0.9rem; line-height: 1.5; margin-bottom: 1rem;\">We know you'll share your thoughts with us, so here's <strong>50 coins</strong> to celebrate your streak!</p>
              <a href=\"${
                process.env.FEEDBACK_URL || "https://tally.so/r/3xoNOo"
              }\" target=\"_blank\" style=\"display: inline-block; padding: 0.5rem 1rem; background-color: #a64d79; color: white; border-radius: 9999px; text-decoration: none; font-size: 0.9rem; font-weight: bold; transition: background-color 0.3s ease;\" onmouseover=\"this.style.backgroundColor='#923e68'\" onmouseout=\"this.style.backgroundColor='#a64d79'\">Share Feedback 💌</a>
            </div>
          `;
          let themedContent = feedbackContent;
          if (user.activeMailTheme) {
            themedContent = applyMailTheme(
              feedbackContent,
              user.activeMailTheme
            );
          }

          mailsToSend.push({
            sender: "Starlit Journals Team",
            title: "Your 3-Day Streak Reward!",
            content: themedContent,
            recipients: [
              { userId: user._id, read: false, rewardClaimed: false },
            ],
            mailType: "reward",
            rewardAmount: 50,
            metadata: { milestone: 3 },
            date: new Date(),
            themeId: user.activeMailTheme,
          });
        }
      }
      // Check for various streak milestones
      const streakMilestones = [7, 14, 30, 60, 90, 180, 365];

      for (const milestone of streakMilestones) {
        if (user.currentStreak === milestone) {
          // Check if this streak milestone has already been sent to the user
          if (user.completedStreakMilestones.includes(milestone)) {
            continue; // Skip if already sent
          }

          // Check if we have templates for this milestone
          const milestoneKey = `${milestone}day`;

          if (mailTemplates.streakMilestone[milestoneKey]) {
            const existingStreakMail = await Mail.findOne({
              "recipients.userId": user._id,
              mailType: "streak",
              "metadata.milestone": milestone,
              date: { $gte: getDateDaysAgo(milestone) },
            });

            if (!existingStreakMail) {
              const streakTemplate = getRandomTemplate(
                mailTemplates.streakMilestone[milestoneKey]
              );

              // Apply mail theme if user has one active
              let content = streakTemplate.content;
              if (user.activeMailTheme) {
                content = applyMailTheme(content, user.activeMailTheme);
              }

              mailsToSend.push({
                sender: streakTemplate.sender,
                title: streakTemplate.title,
                content: content,
                recipients: [
                  {
                    userId: user._id,
                    read: false,
                    rewardClaimed: streakTemplate.rewardAmount
                      ? false
                      : undefined,
                  },
                ],
                mailType: "streak",
                rewardAmount: streakTemplate.rewardAmount,
                metadata: { milestone: milestone },
                date: new Date(),
                themeId: user.activeMailTheme,
              });

              // Add milestone to user's completedStreakMilestones and save
              user.completedStreakMilestones.push(milestone);
              await user.save();
            }
          }
        }
      }

      // 3. ENTRY MILESTONE MAILS
      const entryCount = await Journal.countDocuments({ userId: user._id });
      console.log(entryCount);
      const entryMilestones = [5, 10, 20, 30, 50, 100, 200, 365, 500, 1000];

      for (const milestone of entryMilestones) {
        if (entryCount === milestone) {
          // Check if this entry milestone has already been sent to the user
          if (user.completedEntryMilestones.includes(milestone)) {
            continue; // Skip if already sent
          }

          // Check if we have templates for this milestone
          const milestoneKey = `${milestone}entries`;

          if (mailTemplates.entryMilestone[milestoneKey]) {
            const entryTemplate = getRandomTemplate(
              mailTemplates.entryMilestone[milestoneKey]
            );

            // Apply mail theme if user has one active
            let content = entryTemplate.content;
            if (user.activeMailTheme) {
              content = applyMailTheme(content, user.activeMailTheme);
            }

            mailsToSend.push({
              sender: entryTemplate.sender,
              title: entryTemplate.title,
              content: content,
              recipients: [
                {
                  userId: user._id,
                  read: false,
                  rewardClaimed: entryTemplate.rewardAmount
                    ? false
                    : undefined,
                },
              ],
              mailType: "entry",
              rewardAmount: entryTemplate.rewardAmount,
              metadata: { milestone: milestone },
              date: new Date(),
              themeId: user.activeMailTheme,
            });

            // Add milestone to user's completedEntryMilestones and save
            user.completedEntryMilestones.push(milestone);
            await user.save();
          }
        }
      }
    } catch (error) {
      console.error("Error generating milestone mails:", error);
    }

    // 4. INACTIVITY REMINDER
    try {
      const hasJournaled = await Journal.exists({ userId: user._id });

      if (hasJournaled) {
        const lastJournaled = user.lastJournaled
          ? new Date(user.lastJournaled)
          : null;

        if (lastJournaled) {
          // Different inactivity periods
          const inactivityPeriods = [
            { days: 3, templates: mailTemplates.inactivity.short },
            { days: 7, templates: mailTemplates.inactivity.medium },
            { days: 14, templates: mailTemplates.inactivity.long },
          ];

          for (const period of inactivityPeriods) {
            const cutoffDate = getDateDaysAgo(period.days);

            if (lastJournaled < cutoffDate) {
              const recentInactivityMail = await Mail.findOne({
                "recipients.userId": user._id,
                mailType: "inactivity",
                date: { $gte: getDateDaysAgo(period.days + 2) },
              });

              if (!recentInactivityMail) {
                const inactivityTemplate = getRandomTemplate(period.templates);

                // Apply mail theme if user has one active
                let content = inactivityTemplate.content;
                if (user.activeMailTheme) {
                  content = applyMailTheme(content, user.activeMailTheme);
                }

                mailsToSend.push({
                  sender: inactivityTemplate.sender,
                  title: inactivityTemplate.title,
                  content: content,
                  recipients: [{ userId: user._id, read: false }],
                  mailType: "inactivity",
                  metadata: { period: period.days },
                  date: new Date(),
                  themeId: user.activeMailTheme,
                });

                // Only send one inactivity mail (the longest period that applies)
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error generating inactivity mail:", error);
    }

    // 5. WEEKLY SUMMARY MAIL
    try {
      if (isFirstLoginOfWeek(lastVisited)) {
        const oneWeekAgo = getDateDaysAgo(1);
        // Check for recent summary to prevent duplicates
        const recentSummaryMail = await Mail.findOne({
          "recipients.userId": user._id,
          mailType: "summary",
          date: { $gte: oneWeekAgo },
        });

        if (!recentSummaryMail) {
          const weeklyEntries = await Journal.find({
            userId: user._id,
            date: { $gte: oneWeekAgo },
          }).sort({ date: 1 }); // Sort chronologically for trend analysis

          if (weeklyEntries.length > 0) {
            // ENHANCED MOOD ANALYSIS
            const moodCounts = {};
            const moodTrends = [];
            const dailyMoods = {};

            weeklyEntries.forEach((entry, index) => {
              // Count moods
              moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;

              // Track mood progression
              moodTrends.push({
                mood: entry.mood,
                date: entry.date,
                index: index,
              });

              // Daily mood tracking
              const dayKey = new Date(entry.date).toDateString();
              if (!dailyMoods[dayKey]) dailyMoods[dayKey] = [];
              dailyMoods[dayKey].push(entry.mood);
            });

            // Calculate mood stability and trends
            const moodValues = {
              Happy: 5,
              Excited: 4,
              Neutral: 3,
              Reflective: 3,
              Tired: 2,
              Anxious: 1,
              Sad: 1,
              Angry: 0,
            };

            const moodScores = moodTrends.map((m) => moodValues[m.mood] || 3);
            const avgMoodScore =
              moodScores.reduce((a, b) => a + b, 0) / moodScores.length;

            // Trend analysis (improving/declining/stable)
            const firstHalf = moodScores.slice(
              0,
              Math.floor(moodScores.length / 2)
            );
            const secondHalf = moodScores.slice(
              Math.floor(moodScores.length / 2)
            );
            const firstHalfAvg =
              firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const secondHalfAvg =
              secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

            let moodTrend = "stable";
            let trendEmoji = "📈";
            if (secondHalfAvg > firstHalfAvg + 0.5) {
              moodTrend = "improving";
              trendEmoji = "📈";
            } else if (secondHalfAvg < firstHalfAvg - 0.5) {
              moodTrend = "declining";
              trendEmoji = "📉";
            } else {
              trendEmoji = "➡️";
            }

            let mostFrequentMood = "Neutral";
            let maxCount = 0;
            for (const [mood, count] of Object.entries(moodCounts)) {
              if (count > maxCount) {
                mostFrequentMood = mood;
                maxCount = count;
              }
            }

            // ENHANCED TIME ANALYSIS
            const hourCounts = {};
            const dayOfWeekCounts = {};
            weeklyEntries.forEach((entry) => {
              const entryDate = new Date(entry.date);
              const hour = entryDate.getHours();
              const dayOfWeek = entryDate.getDay();
              const dayNames = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ];

              hourCounts[hour] = (hourCounts[hour] || 0) + 1;
              dayOfWeekCounts[dayNames[dayOfWeek]] =
                (dayOfWeekCounts[dayNames[dayOfWeek]] || 0) + 1;
            });

            let preferredTime = "various times";
            let maxHourCount = 0;
            for (const [hour, count] of Object.entries(hourCounts)) {
              if (count > maxHourCount) {
                maxHourCount = count;
                preferredTime =
                  hour >= 5 && hour < 12
                    ? "morning"
                    : hour >= 12 && hour < 17
                    ? "afternoon"
                    : hour >= 17 && hour < 21
                    ? "evening"
                    : "night";
              }
            }

            // Find most common journaling day
            let preferredDay = "various days";
            let maxDayCount = 0;
            for (const [day, count] of Object.entries(dayOfWeekCounts)) {
              if (count > maxDayCount) {
                maxDayCount = count;
                preferredDay = day;
              }
            }

            // ENHANCED CONTENT ANALYSIS
            let totalWords = 0;
            let totalCharacters = 0;
            const wordCountDistribution = [];

            weeklyEntries.forEach((entry) => {
              if (entry.content) {
                const wordCount = entry.content.split(/\s+/).length;
                const charCount = entry.content.length;
                totalWords += wordCount;
                totalCharacters += charCount;
                wordCountDistribution.push(wordCount);
              }
            });

            const avgWordsPerEntry = Math.round(
              totalWords / weeklyEntries.length
            );
            const avgCharactersPerEntry = Math.round(
              totalCharacters / weeklyEntries.length
            );

            // Content consistency analysis
            wordCountDistribution.sort((a, b) => a - b);
            const median =
              wordCountDistribution[
                Math.floor(wordCountDistribution.length / 2)
              ];
            const shortest = Math.min(...wordCountDistribution);
            const longest = Math.max(...wordCountDistribution);

            let longestEntry = { content: "", date: null };
            let shortestEntry = { content: "a".repeat(10000), date: null };
            weeklyEntries.forEach((entry) => {
              if (
                entry.content &&
                entry.content.length > longestEntry.content.length
              ) {
                longestEntry = entry;
              }
              if (
                entry.content &&
                entry.content.length < shortestEntry.content.length
              ) {
                shortestEntry = entry;
              }
            });

            const longestEntryDay = longestEntry.date
              ? new Date(longestEntry.date).toLocaleDateString("en-US", {
                  weekday: "long",
                })
              : "N/A";

            // TAG AND THEME ANALYSIS
            const tagCounts = {};
            const themeCounts = {};
            const collectionCounts = {};

            weeklyEntries.forEach((entry) => {
              // Count tags
              if (entry.tags && entry.tags.length > 0) {
                entry.tags.forEach((tag) => {
                  tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
              }

              // Count themes
              if (entry.theme) {
                themeCounts[entry.theme] = (themeCounts[entry.theme] || 0) + 1;
              }

              // Count collections
              if (entry.collections && entry.collections.length > 0) {
                entry.collections.forEach((collection) => {
                  if (collection !== "All") {
                    // Exclude default 'All' collection
                    collectionCounts[collection] =
                      (collectionCounts[collection] || 0) + 1;
                  }
                });
              }
            });

            // Get top tags and themes
            const topTags = Object.entries(tagCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([tag, count]) => `${tag} (${count})`);

            const topTheme =
              Object.entries(themeCounts).length > 0
                ? Object.entries(themeCounts).sort(
                    ([, a], [, b]) => b - a
                  )[0][0]
                : null;

            const topCollections = Object.entries(collectionCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 2)
              .map(([collection, count]) => `${collection} (${count})`);

            // JOURNALING CONSISTENCY ANALYSIS
            const journalingDays = [
              ...new Set(
                weeklyEntries.map((entry) =>
                  new Date(entry.date).toDateString()
                )
              ),
            ].length;

            const consistencyScore = Math.round((journalingDays / 7) * 100);
            let consistencyMessage = "";
            let consistencyEmoji = "";

            if (consistencyScore >= 85) {
              consistencyMessage =
                "Exceptional consistency! You're building a strong habit.";
              consistencyEmoji = "🔥";
            } else if (consistencyScore >= 60) {
              consistencyMessage = "Great consistency! Keep up the momentum.";
              consistencyEmoji = "⭐";
            } else if (consistencyScore >= 40) {
              consistencyMessage =
                "Good start! Try to journal a bit more regularly.";
              consistencyEmoji = "🌱";
            } else {
              consistencyMessage =
                "Every entry counts! Consider setting a daily reminder.";
              consistencyEmoji = "💪";
            }

            // PERSONALIZED INSIGHTS
            const insights = [];

            // Mood insights
            if (
              mostFrequentMood === "Happy" ||
              mostFrequentMood === "Excited"
            ) {
              insights.push(
                "Your positive energy shines through your entries! ✨"
              );
            } else if (mostFrequentMood === "Reflective") {
              insights.push(
                "You're in a thoughtful phase - perfect for self-discovery! 🤔"
              );
            } else if (
              mostFrequentMood === "Anxious" ||
              mostFrequentMood === "Sad"
            ) {
              insights.push(
                "Remember: journaling during tough times builds resilience. You're doing great! 💙"
              );
            }

            // Writing pattern insights
            if (avgWordsPerEntry > 200) {
              insights.push(
                "You're a natural storyteller with rich, detailed entries! 📖"
              );
            } else if (avgWordsPerEntry < 50) {
              insights.push(
                "Concise and focused - sometimes less is more! Consider expanding when you feel inspired. ✍️"
              );
            }

            // Time pattern insights
            if (preferredTime === "morning") {
              insights.push(
                "Morning pages are powerful! You're setting positive intentions for your days. 🌅"
              );
            } else if (preferredTime === "evening") {
              insights.push(
                "Evening reflection helps process the day. Great for better sleep! 🌙"
              );
            }

            // RECOMMENDATIONS
            const recommendations = [];

            if (journalingDays < 5) {
              recommendations.push(
                "Try setting a daily reminder to journal at your preferred time (" +
                  preferredTime +
                  ")"
              );
            }

            if (avgWordsPerEntry < 100) {
              recommendations.push(
                "Challenge yourself to write one extra sentence per entry this week"
              );
            }

            if (topTags.length < 2) {
              recommendations.push(
                "Experiment with more tags to better categorize your thoughts and feelings"
              );
            }

            if (moodTrend === "declining") {
              recommendations.push(
                "Consider adding gratitude or positive affirmations to your journaling routine"
              );
            }

            const randomPrompt = getRandomPrompt();
            const defaultTemplate = {
              sender: "Starlit Journals Team",
              title: "Your Detailed Weekly Journal Insights 📊✨",
              content: `
                <div style="padding: 1rem; background: linear-gradient(to bottom, #ffe5d9, #fff5eb); border: 2px solid #ffccbc; box-shadow: 0 4px 8px rgba(255, 204, 188, 0.2); color: #5c4033; font-family: 'Indie Flower', Helvetica, sans-serif; margin: 0 auto; text-align: center; ">
  
  <h2 style="font-size: 1.8rem; margin-bottom: 1rem; letter-spacing: 0.5px;">Your Weekly Journal Deep Dive 🔍</h2>
  <p style="font-size: 1rem; line-height: 1.6; margin-bottom: 0.5rem;">Hello, Thoughtful Writer,</p>
  <p style="font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">Here's your comprehensive week in journaling - insights, patterns, and growth!</p>
  
  <!-- OVERVIEW STATS -->
  <div style="background: rgba(255, 245, 235, 0.9); padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px;">
    <h3 style="margin: 0 0 1rem 0; color: #d84315;">📈 Weekly Overview</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; text-align: left;">
      <p style="margin: 0.3rem 0; font-size: 0.9rem;"><strong>Total Entries:</strong> {entryCount}</p>
      <p style="margin: 0.3rem 0; font-size: 0.9rem;"><strong>Days Journaled:</strong> {journalingDays}/7</p>
      <p style="margin: 0.3rem 0; font-size: 0.9rem;"><strong>Total Words:</strong> {totalWords}</p>
      <p style="margin: 0.3rem 0; font-size: 0.9rem;"><strong>Avg per Entry:</strong> {avgWordsPerEntry} words</p>
      <p style="margin: 0.3rem 0; font-size: 0.9rem;"><strong>Consistency:</strong> {consistencyScore}% {consistencyEmoji}</p>
      <p style="margin: 0.3rem 0; font-size: 0.9rem;"><strong>Range:</strong> {shortest}-{longest} words</p>
    </div>
    <p style="margin: 1rem 0 0 0; font-style: italic; color: #ff6d00;">{consistencyMessage}</p>
  </div>

  <!-- MOOD ANALYSIS -->
  <div style="background: rgba(255, 245, 235, 0.9); padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px;">
    <h3 style="margin: 0 0 1rem 0; color: #d84315;">🎭 Mood Journey</h3>
    <p style="margin: 0.5rem 0; font-size: 0.95rem;"><strong>Dominant Mood:</strong> {mostFrequentMood} ({maxCount} entries)</p>
    <p style="margin: 0.5rem 0; font-size: 0.95rem;"><strong>Weekly Trend:</strong> {moodTrend} {trendEmoji}</p>
    <p style="margin: 0.5rem 0; font-size: 0.95rem;"><strong>Mood Score:</strong> {avgMoodScore}/5.0</p>
    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(255, 255, 255, 0.6); border-left: 3px solid #ff8a65;">
      <p style="margin: 0; font-size: 0.85rem; font-style: italic;">💡 All moods recorded: {moodBreakdown}</p>
    </div>
  </div>

  <!-- WRITING PATTERNS -->
  <div style="background: rgba(255, 245, 235, 0.9); padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px;">
    <h3 style="margin: 0 0 1rem 0; color: #d84315;">⏰ Your Writing Rhythms</h3>
    <div style="text-align: left;">
      <p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>Favorite Time:</strong> {preferredTime}</p>
      <p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>Preferred Day:</strong> {preferredDay}</p>
      <p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>Longest Entry:</strong> {longestEntryDay}</p>
      <p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>Top Tags:</strong> {topTags}</p>
      {topThemeSection}
      {topCollectionsSection}
    </div>
  </div>

  <!-- INSIGHTS -->
  <div style="background: rgba(255, 245, 235, 0.9); padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px;">
    <h3 style="margin: 0 0 1rem 0; color: #d84315;">💎 Personal Insights</h3>
    <div style="text-align: left;">
      {insightsList}
    </div>
  </div>

  <!-- RECOMMENDATIONS -->
  <div style="background: rgba(255, 245, 235, 0.9); padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px;">
    <h3 style="margin: 0 0 1rem 0; color: #d84315;">🎯 Growth Suggestions</h3>
    <div style="text-align: left;">
      {recommendationsList}
    </div>
  </div>

  <div style="border-top: 2px dotted #ffccbc; margin: 1.5rem 0; position: relative;">
    <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #fff5eb; padding: 0 10px; font-size: 0.8rem; color: #ff8a65;">✨</span>
  </div>
  
  <h3 style="font-size: 1.3rem; margin-bottom: 0.75rem;">This Week's Writing Spark 💌</h3>
  <p style="font-size: 0.9rem; line-height: 1.5; font-style: italic; margin-bottom: 1rem; background: rgba(255, 255, 255, 0.6); padding: 1rem; border-radius: 6px;">{randomPrompt}</p>
  
  <a style="display: inline-block; padding: 0.8rem 2rem; background: #ff8a65; color: #fff5eb; text-decoration: none; font-size: 1rem; font-weight: bold; border-radius: 25px; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(255, 138, 101, 0.3);" href="journaling-alt" onmouseover="this.style.background='#e07b59'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='#ff8a65'; this.style.transform='translateY(0)'">Continue Your Journey ✍️</a>
  
  <p style="font-size: 0.95rem; line-height: 1.6; margin-top: 1.5rem; color: #8d6e63;">Keep nurturing your inner world through words,<br><strong>The Starlit Journals Team</strong></p>
</div>
              `,
            };
            const summaryTemplate = defaultTemplate;

            // Prepare dynamic content sections
            const moodBreakdown = Object.entries(moodCounts)
              .map(([mood, count]) => `${mood}(${count})`)
              .join(", ");

            const topThemeSection = topTheme
              ? `<p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>Favorite Theme:</strong> ${topTheme}</p>`
              : "";

            const topCollectionsSection =
              topCollections.length > 0
                ? `<p style="margin: 0.5rem 0; font-size: 0.9rem;"><strong>Active Collections:</strong> ${topCollections.join(
                    ", "
                  )}</p>`
                : "";

            const insightsList = insights
              .map(
                (insight) =>
                  `<p style="margin: 0.5rem 0; font-size: 0.9rem; padding-left: 1rem; border-left: 2px solid #ff8a65;">• ${insight}</p>`
              )
              .join("");

            const recommendationsList =
              recommendations.length > 0
                ? recommendations
                    .map(
                      (rec) =>
                        `<p style="margin: 0.5rem 0; font-size: 0.9rem; padding-left: 1rem; border-left: 2px solid #4caf50;">• ${rec}</p>`
                    )
                    .join("")
                : '<p style="margin: 0.5rem 0; font-size: 0.9rem; padding-left: 1rem; border-left: 2px solid #4caf50;">• You\'re doing great! Keep up your journaling journey.</p>';

            let content = summaryTemplate.content
              .replace("{entryCount}", weeklyEntries.length)
              .replace("{journalingDays}", journalingDays)
              .replace("{totalWords}", totalWords.toLocaleString())
              .replace("{avgWordsPerEntry}", avgWordsPerEntry)
              .replace("{consistencyScore}", consistencyScore)
              .replace("{consistencyEmoji}", consistencyEmoji)
              .replace("{shortest}", shortest)
              .replace("{longest}", longest)
              .replace("{consistencyMessage}", consistencyMessage)
              .replace("{mostFrequentMood}", mostFrequentMood)
              .replace("{maxCount}", maxCount)
              .replace("{moodTrend}", moodTrend)
              .replace("{trendEmoji}", trendEmoji)
              .replace("{avgMoodScore}", avgMoodScore.toFixed(1))
              .replace("{moodBreakdown}", moodBreakdown)
              .replace("{preferredTime}", preferredTime)
              .replace("{preferredDay}", preferredDay)
              .replace("{longestEntryDay}", longestEntryDay)
              .replace("{topTags}", topTags.join(", ") || "None yet")
              .replace("{topThemeSection}", topThemeSection)
              .replace("{topCollectionsSection}", topCollectionsSection)
              .replace("{insightsList}", insightsList)
              .replace("{recommendationsList}", recommendationsList)
              .replace("{randomPrompt}", randomPrompt);

            // if (user.activeMailTheme) {
            //   content = applyMailTheme(content, user.activeMailTheme);
            // }

            mailsToSend.push({
              sender: summaryTemplate.sender,
              title: summaryTemplate.title,
              content,
              recipients: [{ userId: user._id, read: false }],
              mailType: "summary",
              date: new Date(),
              themeId: user.activeMailTheme,
            });
          }
        }
      }
    } catch (error) {
      error.push(`Weekly summary mail error: ${error.message}`);
    }

    // 6. SEASONAL/HOLIDAY MAILS
    // try {
    //   const specialDate = getSpecialDate();
    //   // const specialDate = "valentines";

    //   if (
    //     specialDate &&
    //     mailTemplates.seasonal &&
    //     mailTemplates.seasonal[specialDate]
    //   ) {
    //     const recentSeasonalMail = await Mail.findOne({
    //       "recipients.userId": user._id,
    //       mailType: "seasonal",
    //       "metadata.season": specialDate,
    //       date: { $gte: getDateDaysAgo(7) },
    //     });

    //     if (!recentSeasonalMail) {
    //       const seasonalTemplate = getRandomTemplate(
    //         mailTemplates.seasonal[specialDate]
    //       );

    //       // Apply mail theme if user has one active
    //       let content = seasonalTemplate.content;
    //       if (user.activeMailTheme) {
    //         content = applyMailTheme(content, user.activeMailTheme);
    //       }

    //       mailsToSend.push({
    //         sender: seasonalTemplate.sender,
    //         title: seasonalTemplate.title,
    //         content: content,
    //         recipients: [{ userId: user._id, read: false }],
    //         mailType: "seasonal",
    //         metadata: { season: specialDate },
    //         date: new Date(),
    //         themeId: user.activeMailTheme,
    //       });
    //     }
    //   }
    // } catch (error) {
    //   console.error("Error generating seasonal mail:", error);
    // }

    // 7. TIPS AND INSPIRATION
    try {
      // Send tips and inspiration periodically (every 2 weeks)
      const twoWeeksAgo = getDateDaysAgo(14);

      const recentTipMail = await Mail.findOne({
        "recipients.userId": user._id,
        mailType: "tip",
        date: { $gte: twoWeeksAgo },
      });

      if (!recentTipMail && Math.random() < 0.3) {
        // 30% chance to send a tip
        const tipTemplate = getRandomTemplate(mailTemplates.tipsAndInspiration);

        // Apply mail theme if user has one active
        let content = tipTemplate.content;
        if (user.activeMailTheme) {
          content = applyMailTheme(content, user.activeMailTheme);
        }

        mailsToSend.push({
          sender: tipTemplate.sender,
          title: tipTemplate.title,
          content: content,
          recipients: [{ userId: user._id, read: false }],
          mailType: "tip",
          date: new Date(),
          themeId: user.activeMailTheme,
        });
      }
    } catch (error) {
      console.error("Error generating tip mail:", error);
    }

    // 8. RANDOM WRITING PROMPT
    try {
      // Send a random writing prompt occasionally (10% chance if no recent prompt)
      const oneWeekAgo = getDateDaysAgo(7);

      const recentPromptMail = await Mail.findOne({
        "recipients.userId": user._id,
        mailType: "prompt",
        date: { $gte: oneWeekAgo },
      });

      if (!recentPromptMail && Math.random() < 0.3) {
        // 30% chance to send a prompt
        const prompt = getRandomPrompt();
        const promptTemplate = getRandomTemplate(
          mailTemplates.promptMail || [{ content: "Today's prompt: {prompt}" }]
        );

        // Replace placeholder in the template
        let content = promptTemplate.content.replace("{prompt}", prompt);

        // Apply mail theme if user has one active
        if (user.activeMailTheme) {
          content = applyMailTheme(content, user.activeMailTheme);
        }

        let sender = promptTemplate.sender || "The Whispering Grove";
        let title =
          promptTemplate.title || "A Prompt from the Woodland Scrolls";

        const getRandomFromArray = (arr) =>
          Array.isArray(arr) && arr.length > 0
            ? arr[Math.floor(Math.random() * arr.length)]
            : "";

        // Elf-style override if the theme is Elbaf
        if (user.activeMailTheme === "mailtheme_elf_from_elbaf") {
          sender = "Elarion of Elbaf";
          const elfTitles = [
            "The Prompt the Forest Whispered",
            "A Thought Plucked from the Stars",
            "Today's Prompt from the Elder Quill",
            "Your Muse Awaits Among the Leaves",
            "A Writing Seed from Elbaf's Grove",
            "The Wind Carried This Prompt",
            "A Whisper from the Ink Grove",
            "A Glimmer of Thought for You",
            "The Prompt Bloomed with Dawnlight",
          ];
          title = getRandomFromArray(elfTitles);
        }

        if (user.activeMailTheme === "mailtheme_wifu") {
          sender = "Rexona";
          const wifuTitles = [
            "Your Daily Prompt, Cutie~ 💖",
            "Write This for Me, Senpai! 💌",
            "A Tiny Prompt, Just for You~ ✨",
            "Nyaa~ Take This Prompt Already! 🐾",
            "Let's Write Something Adorable Today! 💕",
            "💖 Today's Prompt from Your Favorite Girl~",
            "💌 Teehee~ Try Writing This One!",
            "🐾 Wifey-Approved Prompt Delivery~",
            "💕 I Wrote You a Prompt... and a Kiss! 😚",
          ];
          title = getRandomFromArray(wifuTitles);
        }

        mailsToSend.push({
          sender: sender,
          title: title,
          content: content,
          recipients: [{ userId: user._id, read: false }],
          mailType: "prompt",
          date: new Date(),
          themeId: user.activeMailTheme,
        });
      }
    } catch (error) {
      console.error("Error generating prompt mail:", error);
    }

    try {
      // 9. DAILY COZY MESSAGE
      const oneDayAgo = getDateDaysAgo(2);
      const recentCozyMail = await Mail.findOne({
        "recipients.userId": user._id,
        mailType: "prompt",
        date: { $gte: oneDayAgo },
      });

      if (
        !recentCozyMail &&
        mailTemplates.CozyMessages &&
        mailTemplates.CozyMessages.length > 0
      ) {
        const cozyMessage = getRandomTemplate(mailTemplates.CozyMessages); // Assuming getRandomTemplate works with strings
        let sender = "Starlit Journals Team";
        let title = "A Cozy Note for You ✨";

        // Theme-specific overrides
        if (user.activeMailTheme === "mailtheme_elf_from_elbaf") {
          sender = "Elarion of Elbaf";
          const elfTitles = [
            "A Whisper from the Grove",
            "A Thought from Elbaf's Stars",
            "A Cozy Note from the Forest",
            "A Gentle Spark for Your Day",
            "The Quill of Elbaf Sends This",
          ];
          title = elfTitles[Math.floor(Math.random() * elfTitles.length)];
        } else if (user.activeMailTheme === "mailtheme_wifu") {
          sender = "Rexona";
          const wifuTitles = [
            "A Cozy Hug for You~ 💖",
            "Your Daily Warmth, Senpai! 💌",
            "A Sweet Note Just for You~ ✨",
            "Nyaa~ Feel This Cozy Vibe! 🐾",
            "A Little Love Note for Today! 💕",
          ];
          title = wifuTitles[Math.floor(Math.random() * wifuTitles.length)];
        }

        const cozyTemplate = {
          sender,
          title,
          content: `
        <div style="padding: 1.25rem; background: rgba(243, 231, 245, 0.4); border-radius: 10px; font-family: 'Indie Flower', 'Helvetica', sans-serif; color: #4b2e60; text-align: center; max-width: 600px; margin: 0 auto; backdrop-filter: blur(4px);">
  <p style="font-size: 0.9rem; margin-bottom: 1.2rem;">Hey Journaler 🌿</p>

  <div style="font-size: 1rem; line-height: 1.6; padding: 1rem; border-radius: 8px; background: rgba(255, 255, 255, 0.5); font-style: italic; font-weight: 500; color: #3f2b4f;">
    ${cozyMessage}
  </div>

  <a style="display: inline-block; margin-top: 1.25rem; font-size: 0.85rem; padding: 0.4rem 1rem; border-radius: 9999px; background: #d8b4fe; color: white; text-decoration: none; transition: all 0.2s ease;" 
     href="journaling-alt" 
     onmouseover="this.style.background='#c084fc'; this.style.transform='translateY(-1px)'" 
     onmouseout="this.style.background='#d8b4fe'; this.style.transform='translateY(0)'">
    Open Journal ✍️
  </a>
</div>

      `,
        };

        // Apply mail theme if user has one active
        let content = cozyTemplate.content;
        if (user.activeMailTheme) {
          content = applyMailTheme(content, user.activeMailTheme);
        }

        mailsToSend.push({
          sender: cozyTemplate.sender,
          title: cozyTemplate.title,
          content,
          recipients: [{ userId: user._id, read: false }],
          mailType: "prompt",
          date: new Date(),
          themeId: user.activeMailTheme,
        });
      }
    } catch (error) {
      console.error("Error generating cozy message mail:", error);
    }

    // 10. STORY DELIVERY
    try {
      const today = new Date().toDateString();
      const { storyName, currentChapter, lastSent } = user.storyProgress || {};
      const lastSentDate = lastSent ? new Date(lastSent).toDateString() : null;

      // Only send if today's story wasn't already sent
      if (today !== lastSentDate) {
        const story = storyData.stories.find(
          (s) => s["Story Name"] === storyName
        );

        if (story && currentChapter <= story.number_of_chapters) {
          // If chapter number missing from JSON, assign manually by index
          const chapterData = story.chapters[currentChapter - 1];
          if (chapterData) {
            const storyMail = new Mail({
              sender: story.character,
              title: `Chapter ${currentChapter}: ${chapterData.title}`,
              content: `
  <div style="
    background-image: url('${story.image}');
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center;
    padding: 2rem;
    border-radius: 10px;
    color: #2c2c2c;
    font-family: 'Indie Flower', cursive;
  ">
    <div style="
      background-color: rgba(255, 255, 255, 0.6);
      padding: 1.25rem;
      border-radius: 10px;
      white-space: pre-wrap;
    ">
      ${chapterData.content}
    </div>
  </div>
`,
              recipients: [{ userId: user._id, read: false }],
              mailType: "story",
              metadata: { chapter: currentChapter },
              date: new Date(),
            });

            await storyMail.save();

            // Update story progress
            user.storyProgress = {
              storyName,
              currentChapter: currentChapter + 1,
              lastSent: new Date(),
            };
            await user.save();
          }
        }
      }
    } catch (error) {
      console.error("Error sending story chapter:", error);
    }

    // Save all generated mails
    if (mailsToSend.length > 0) {
      await Mail.insertMany(mailsToSend);
      // console.log(
      //   `Sent ${mailsToSend.length} automated mails to user ${user._id}`
      // );
    }
    // ===== END MAIL AUTOMATION LOGIC =====

    res.status(200).json({
      message: "Login successful!",
      user,
      coinsEarned,
      streakBonus,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get number of users
router.get("/users", async (req, res) => {
  try {
    const users = await User.countDocuments();
    res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

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

    // Validate password
    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long." });
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

export default router;
