import express from "express";
import mongoose from "mongoose";
import Journal from "../models/Journal.js";
import User from "../models/User.js";
import Mail from "../models/Mail.js";

const router = express.Router();

// --- Specific Journal Routes (Static Paths) ---
router.get("/journals/journalscount", async (req, res) => {
  try {
    const count = await Journal.countDocuments();
    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching journal count:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Add this route to get comment count for journals
router.get("/journals/with-comments", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 10;
    const sort = req.query.sort || "-activityScore";
    const skip = (page - 1) * limit;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Invalid page or limit value" });
    }

    let sortOption;
    switch (sort) {
      case "likeCount":
        sortOption = { likeCount: -1, createdAt: -1 };
        break;
      case "createdAt":
        sortOption = { createdAt: 1 };
        break;
      case "-createdAt":
        sortOption = { createdAt: -1 };
        break;
      case "commentCount":
        sortOption = { commentCount: -1, createdAt: -1 };
        break;
      case "-commentCount":
        sortOption = { commentCount: -1, createdAt: -1 };
        break;
      case "activityScore":
      case "-activityScore":
      default:
        // Default to activity score descending
        sortOption = { activityScore: -1, createdAt: -1 };
        break;
    }

    // Calculate days since epoch for recency calculation
    const now = new Date();
    const daysSinceEpoch = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));

    // Aggregate to get journals with activity score
    const journals = await Journal.aggregate([
      { $match: { isPublic: true } },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "journalId",
          as: "comments",
        },
      },
      {
        $addFields: {
          commentCount: { $size: "$comments" },
          // Calculate days since creation
          daysSinceCreation: {
            $floor: {
              $divide: [
                { $subtract: [now, "$createdAt"] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          // Calculate recency factor (higher for newer posts)
          recencyFactor: {
            $max: [
              0.1, // Minimum factor
              {
                $subtract: [
                  1,
                  {
                    $divide: [
                      { $subtract: [now, "$createdAt"] },
                      1000 * 60 * 60 * 24 * 30 // 30 days decay
                    ]
                  }
                ]
              }
            ]
          }
        },
      },
      {
        $addFields: {
          // Activity Score Formula:
          // (Likes * 2 + Comments * 3 + Saves * 1.5) * Recency Factor
          // This gives more weight to comments and considers recency
          activityScore: {
            $multiply: [
              {
                $add: [
                  { $multiply: ["$likeCount", 2] },
                  { $multiply: ["$commentCount", 3] },
                  { $multiply: [{ $size: "$saved" }, 1.5] }
                ]
              },
              "$recencyFactor"
            ]
          }
        },
      },
      {
        $project: {
          title: 1,
          content: 1,
          authorName: 1,
          createdAt: 1,
          likeCount: 1,
          likes: 1,
          theme: 1,
          mood: 1,
          tags: 1,
          slug: 1,
          commentCount: 1,
          saved: 1,
          activityScore: 1,
          recencyFactor: 1,
          daysSinceCreation: 1,
        },
      },
      { $sort: sortOption },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalJournals = await Journal.countDocuments({ isPublic: true });
    const hasMore = skip + journals.length < totalJournals;

    res.json({
      journals,
      hasMore,
      page,
      limit,
      total: totalJournals,
    });
  } catch (error) {
    console.error("Error fetching journals with comments:", error);
    res.status(500).json({
      message: "Error fetching journals",
      error: error.message,
    });
  }
});

// Get top 5 liked posts for each mood category
router.get("/journals/top-by-mood", async (req, res) => {
  try {
    // Get all unique moods from public journals
    const moods = await Journal.distinct("mood", { isPublic: true });

    const facetPipelines = {};
    moods.forEach((mood) => {
      facetPipelines[mood] = [
        { $match: { isPublic: true, mood: mood } },
        { $sort: { likeCount: -1, createdAt: -1 } },
        { $limit: 5 },
        {
          $project: {
            title: 1,
            slug: 1,
            authorName: 1,
            likeCount: 1,
            content: 1,
          },
        },
      ];
    });

    if (Object.keys(facetPipelines).length === 0) {
      return res.json({});
    }
    const results = await Journal.aggregate([{ $facet: facetPipelines }]);
    res.json(results[0]);
  } catch (error) {
    console.error("Error fetching top journals by mood:", error);
    res.status(500).json({
      message: "Error fetching top journals by mood",
      error: error.message,
    });
  }
});

// Get all public journals with pagination and sorting
router.get("/journals/public", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 20;
    const sort = req.query.sort || "-createdAt";
    const skip = (page - 1) * limit;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Invalid page or limit value" });
    }

    let sortOption;
    switch (sort) {
      case "likeCount":
        sortOption = { likeCount: -1, createdAt: -1 };
        break;
      case "createdAt":
        sortOption = { createdAt: 1 };
        break;
      case "-createdAt":
        sortOption = { createdAt: -1 };
        break;
      case "commentCount":
        sortOption = { commentCount: -1, createdAt: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
        break;
    }

    const matchQuery = { isPublic: true };

    // Populate userId for author info
    const journals = await Journal.find(matchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('userId', 'anonymousName profileTheme')
      .lean();

    // Get comment counts for all journals in parallel
    const Comment = (await import('../models/comment.js')).default;
    const journalIds = journals.map(j => j._id);
    const commentCounts = await Comment.aggregate([
      { $match: { journalId: { $in: journalIds } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } }
    ]);
    const commentCountMap = {};
    commentCounts.forEach(cc => { commentCountMap[cc._id.toString()] = cc.count; });

    // Add author field and commentCount
    const journalsWithAuthor = journals.map(journal => ({
      ...journal,
      author: journal.userId ? {
        userId: journal.userId._id,
        anonymousName: journal.userId.anonymousName,
        profileTheme: journal.userId.profileTheme,
      } : null,
      commentCount: commentCountMap[journal._id.toString()] || 0,
    }));

    const totalJournals = await Journal.countDocuments(matchQuery);
    const hasMore = skip + journalsWithAuthor.length < totalJournals;

    res.json({
      journals: journalsWithAuthor,
      hasMore,
      page,
      limit,
      total: totalJournals,
    });
  } catch (error) {
    console.error("Error fetching public journals:", error);
    res.status(500).json({
      message: "Error fetching public journals",
      error: error.message,
    });
  }
});

// --- Dynamic Journal Routes (with /:params) ---

// Get journals from followed users
router.get("/feed/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const user = await User.findById(userId).select("subscribedTo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Populate userId for author info
    const journals = await Journal.find({
      userId: { $in: user.subscribedTo },
      isPublic: true,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'anonymousName profileTheme')
      .lean();

    // Add author field
    const journalsWithAuthor = journals.map(journal => ({
      ...journal,
      author: journal.userId ? {
        userId: journal.userId._id,
        anonymousName: journal.userId.anonymousName,
        profileTheme: journal.userId.profileTheme,
      } : null,
      isFromSubscription: true,
    }));

    const totalJournals = await Journal.countDocuments({
      userId: { $in: user.subscribedTo },
      isPublic: true,
    });
    const hasMore = skip + journalsWithAuthor.length < totalJournals;

    res.json({
      journals: journalsWithAuthor,
      hasMore,
      page,
      limit,
      total: totalJournals,
    });
  } catch (error) {
    console.error("Error fetching feed:", error);
    res
      .status(500)
      .json({ message: "Error fetching feed", error: error.message });
  }
});

// Get the 3 most recent journal entries for a user
router.get("/journals/recent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const recentJournals = await Journal.find({ userId })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    res.status(200).json({ recentJournals });
  } catch (error) {
    console.error("Error fetching recent journals:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

router.get("/journals/singlepublic/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const journal = await Journal.findOne({ slug, isPublic: true }).populate({
      path: "userId",
      select: "anonymousName",
    });

    if (!journal) return res.status(404).json({ message: "Journal not found" });

    // Get comment count for this journal
    const Comment = (await import('../models/comment.js')).default;
    const commentCount = await Comment.countDocuments({ journalId: journal._id });

    const transformedJournal = {
      ...journal.toObject(),
      author: { anonymousName: journal.userId.anonymousName },
      commentCount,
    };

    res.json(transformedJournal);
  } catch (error) {
    console.error("Error fetching public journal:", error);
    res
      .status(500)
      .json({ message: "Error fetching public journal", error: error.message });
  }
});

router.get("/journals/recommendations/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const currentJournal = await Journal.findOne({ slug, isPublic: true });
    if (!currentJournal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    // Find recommendations: match tags, then mood, exclude current
    const tagMatch = {
      isPublic: true,
      slug: { $ne: slug },
      tags: { $in: currentJournal.tags },
    };
    const moodMatch = {
      isPublic: true,
      slug: { $ne: slug },
      mood: currentJournal.mood,
    };

    // Get tag-based recommendations (limit 20)
    let tagRecs = await Journal.find(tagMatch)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    // Remove duplicates by _id
    const seen = new Set();
    tagRecs = tagRecs.filter((j) => {
      if (seen.has(j._id.toString())) return false;
      seen.add(j._id.toString());
      return true;
    });

    // If less than 8, fill with mood-based recommendations
    let moodRecs = [];
    if (tagRecs.length < 8) {
      moodRecs = await Journal.find(moodMatch)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      moodRecs = moodRecs.filter((j) => !seen.has(j._id.toString()));
    }

    // Combine tag and mood recommendations
    let recommendations = [...tagRecs, ...moodRecs];

    // If still less than 8, fill with random journals
    if (recommendations.length < 8) {
      const randomMatch = {
        isPublic: true,
        slug: { $ne: slug },
        _id: { $nin: recommendations.map(j => j._id) }
      };
      
      const randomRecs = await Journal.find(randomMatch)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      // Add random recommendations until we reach 8 or run out
      for (const randomRec of randomRecs) {
        if (recommendations.length >= 8) break;
        if (!seen.has(randomRec._id.toString())) {
          recommendations.push(randomRec);
          seen.add(randomRec._id.toString());
        }
      }
    }

    // Limit to 8
    recommendations = recommendations.slice(0, 8);

    res.json({ recommendations });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    res.status(500).json({
      message: "Error fetching recommendations",
      error: error.message,
    });
  }
});

// Get journals by tag
router.get("/journals/by-tag/:tag", async (req, res) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sort = req.query.sort || "-createdAt";
    const skip = (page - 1) * limit;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Invalid page or limit value" });
    }

    let sortOption;
    switch (sort) {
      case "likeCount":
        sortOption = { likeCount: -1, createdAt: -1 };
        break;
      case "createdAt":
        sortOption = { createdAt: 1 };
        break;
      case "-createdAt":
        sortOption = { createdAt: -1 };
        break;
      default:
        return res.status(400).json({ message: "Invalid sort parameter" });
    }

    const decodedTag = decodeURIComponent(tag);
    const matchQuery = {
      isPublic: true,
      tags: { $in: [new RegExp(`^${decodedTag}$`, "i")] },
    };

    // Populate userId for author info
    const journals = await Journal.find(matchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('userId', 'anonymousName profileTheme')
      .lean();

    // Add author field
    const journalsWithAuthor = journals.map(journal => ({
      ...journal,
      author: journal.userId ? {
        userId: journal.userId._id,
        anonymousName: journal.userId.anonymousName,
        profileTheme: journal.userId.profileTheme,
      } : null,
    }));

    const totalJournals = await Journal.countDocuments(matchQuery);
    const hasMore = skip + journalsWithAuthor.length < totalJournals;

    res.json({
      journals: journalsWithAuthor,
      hasMore,
      page,
      limit,
      total: totalJournals,
      tag: decodedTag,
    });
  } catch (error) {
    console.error("Error fetching journals by tag:", error);
    res.status(500).json({
      message: "Error fetching journals by tag",
      error: error.message,
    });
  }
});

// Get journal entries for a user (THIS IS THE CATCH-ALL DYNAMIC ROUTE)
router.get("/journals/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const journals = await Journal.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    const collections = [];
    journals.forEach((journal) => {
      if (journal.collections && Array.isArray(journal.collections)) {
        journal.collections.forEach((collection) => {
          if (!collections.includes(collection)) collections.push(collection);
        });
      }
    });

    res.status(200).json({ journals, collections });
  } catch (error) {
    console.error("Error fetching journals:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get journals by collection
router.get("/journals/:userId/collection/:collection", async (req, res) => {
  try {
    const { userId, collection } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const query = { userId };
    if (collection !== "All") query.collections = collection;

    const journals = await Journal.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json({ journals });
  } catch (error) {
    console.error("Error fetching journals by collection:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// --- Other Routes ---

// Update user streak
async function updateUserStreak(userId, journalDate) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const currentDate = new Date(journalDate);
    currentDate.setHours(0, 0, 0, 0);

    const lastJournaledDate = user.lastJournaled
      ? new Date(user.lastJournaled)
      : null;
    if (lastJournaledDate) lastJournaledDate.setHours(0, 0, 0, 0);

    if (
      lastJournaledDate &&
      lastJournaledDate.getTime() === currentDate.getTime()
    )
      return;

    let newStreak = 1;
    if (lastJournaledDate) {
      const yesterday = new Date(currentDate);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastJournaledDate.getTime() === yesterday.getTime()) {
        newStreak = user.currentStreak + 1;
      }
    }

    const newLongestStreak = Math.max(newStreak, user.longestStreak || 0);

    await User.findByIdAndUpdate(userId, {
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      lastJournaled: journalDate,
    });
  } catch (error) {
    console.error("Error updating streak:", error);
  }
}

// Generate SEO-friendly slug
const generateSlug = async (title, Journal) => {
  if (!title || typeof title !== "string") return "";

  const stopWords = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "but",
    "by",
    "for",
    "from",
    "in",
    "into",
    "like",
    "near",
    "nor",
    "of",
    "on",
    "onto",
    "or",
    "over",
    "the",
    "to",
    "with",
    "yet",
  ]);

  const replacements = {
    "&": "and",
    "@": "at",
    "#": "number",
    "%": "percent",
    $: "dollar",
  };

  let slug = title.toLowerCase().trim();
  for (const [char, replacement] of Object.entries(replacements)) {
    slug = slug.replaceAll(char, ` ${replacement} `);
  }

  slug = slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = slug.split(/\s+/).filter((word) => !stopWords.has(word));
  slug = words
    .join(" ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const maxLength = 60;
  if (slug.length > maxLength) {
    const truncated = slug.substring(0, maxLength);
    slug = truncated.substring(0, truncated.lastIndexOf("-")) || truncated;
  }

  if (!slug) slug = "journal";

  let baseSlug = slug;
  let counter = 1;
  let uniqueSlug = slug;

  while (await Journal.findOne({ slug: uniqueSlug })) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
};

// Save journal
router.post("/saveJournal", async (req, res) => {
  try {
    const {
      userId,
      title,
      content,
      mood,
      tags,
      collections,
      theme,
      isPublic,
      authorName,
    } = req.body;

    if (!userId || !title || !content || !mood) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (isPublic && !authorName) {
      return res
        .status(400)
        .json({ message: "Author name is required for public journals" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const slug = await generateSlug(title, Journal);

    const journal = new Journal({
      userId,
      title,
      slug,
      content,
      mood,
      tags,
      collections,
      theme,
      isPublic,
      authorName: isPublic ? authorName : undefined,
      wordCount: content.split(/\s+/).length,
    });

    await journal.save();
    res.status(201).json(journal);
  } catch (error) {
    console.error("Error saving journal:", error);
    res
      .status(500)
      .json({ message: "Error saving journal", error: error.message });
  }
});

// Delete a collection
router.delete("/collection/:userId/:collection", async (req, res) => {
  try {
    const { userId, collection } = req.params;
    const decodedCollection = decodeURIComponent(collection);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (decodedCollection === "All") {
      return res.status(400).json({
        message:
          "Cannot delete the 'All' collection as it is a system collection.",
      });
    }

    const journals = await Journal.find({
      userId,
      collections: decodedCollection,
    });
    if (journals.length === 0) {
      return res
        .status(404)
        .json({ message: "Collection not found or empty." });
    }

    const updateResult = await Journal.updateMany(
      { userId, collections: decodedCollection },
      { $pull: { collections: decodedCollection } }
    );

    res.status(200).json({
      message: "Collection deleted successfully!",
      count: journals.length,
      updated: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error("Error deleting collection:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get a specific journal entry
router.get("/journal/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid journal ID format." });
    }

    const journal = await Journal.findById(id).lean();
    if (!journal) {
      return res.status(404).json({ message: "Journal entry not found." });
    }

    res.status(200).json({ journal });
  } catch (error) {
    console.error("Error fetching journal:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Remove a tag from all journals
router.delete("/tag/:userId/:tag", async (req, res) => {
  try {
    const { userId, tag } = req.params;
    const decodedTag = decodeURIComponent(tag);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const journals = await Journal.find({ userId, tags: decodedTag });
    if (journals.length === 0) {
      return res.status(404).json({ message: "Tag not found in any journal." });
    }

    await Journal.updateMany(
      { userId, tags: decodedTag },
      { $pull: { tags: decodedTag } }
    );

    res.status(200).json({
      message: "Tag removed successfully!",
      count: journals.length,
    });
  } catch (error) {
    console.error("Error removing tag:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Delete a journal entry
router.delete("/journal/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid journal ID format." });
    }

    const deletedJournal = await Journal.findByIdAndDelete(id).lean();
    if (!deletedJournal) {
      return res.status(404).json({ message: "Journal entry not found." });
    }

    res.status(200).json({
      message: "Journal entry deleted successfully!",
      journal: deletedJournal,
    });
  } catch (error) {
    console.error("Error deleting journal:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Like/Unlike a journal
router.post("/journals/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.body.userId;

    if (!userId)
      return res.status(401).json({ message: "User ID is required" });
    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: "Invalid user ID format." });
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid journal ID format." });

    const journal = await Journal.findById(id);
    if (!journal) return res.status(404).json({ message: "Journal not found" });

    const isLiked = journal.likes.includes(userId);
    if (isLiked) {
      journal.likes = journal.likes.filter((id) => id.toString() !== userId);
      journal.likeCount = Math.max(0, journal.likeCount - 1);
    } else {
      journal.likes.push(userId);
      journal.likeCount += 1;
      // Send mail to journal author if liker is not the author
      if (journal.userId.toString() !== userId) {
        const liker = await User.findById(userId);
        const journalAuthor = await User.findById(journal.userId);
        if (liker && journalAuthor) {
          const senderName = liker.anonymousName || liker.nickname || "Someone";
          const journalUrl = `https://starlitjournals.com/public-journals/${journal.slug}`;
          await Mail.create({
            sender: senderName,
            title: `New Like on your post \"${journal.title}\"`,
            content: `<div style=\"font-size:16px;margin-bottom:8px;\"><b>${senderName}</b> liked your post <b>\"${journal.title}\"</b>.</div><a href=\"${journalUrl}\" style=\"display:inline-block;padding:8px 16px;background:#222;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;\">View Journal</a>`,
            recipients: [{ userId: journal.userId, read: false }],
            mailType: "other",
            isSystemMail: true,
            sendToAllUsers: false,
          });
        }
      }
    }

    await journal.save();
    res.json({
      likeCount: journal.likeCount,
      isLiked: !isLiked,
    });
  } catch (error) {
    console.error("Error updating like status:", error);
    res.status(500).json({ message: "Error updating like status" });
  }
});

// Get popular topics (tags) based on likes
router.get("/popular-topics", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const postsPerTag = parseInt(req.query.postsPerTag) || 3;

    // First, get the most popular tags
    const popularTags = await Journal.aggregate([
      { $match: { isPublic: true, tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      {
        $group: {
          _id: { $toUpper: "$tags" },
          totalLikes: { $sum: "$likeCount" },
          journalCount: { $sum: 1 },
          avgLikes: { $avg: "$likeCount" },
        },
      },
      { $sort: { totalLikes: -1, journalCount: -1 } },
      { $limit: limit },
    ]);

    // For each popular tag, get the most liked journals
    const popularTopicsWithPosts = await Promise.all(
      popularTags.map(async (tagData) => {
        const tagName = tagData._id;

        // Get the most liked journals for this tag
        const topPosts = await Journal.aggregate([
          {
            $match: {
              isPublic: true,
              tags: { $in: [new RegExp(`^${tagName}$`, "i")] },
            },
          },
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "journalId",
              as: "comments",
            },
          },
          {
            $addFields: {
              commentCount: { $size: "$comments" },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              content: 1,
              authorName: 1,
              createdAt: 1,
              likeCount: 1,
              likes: 1,
              theme: 1,
              mood: 1,
              tags: 1,
              slug: 1,
              commentCount: 1,
              saved: 1,
            },
          },
          { $sort: { likeCount: -1, createdAt: -1 } },
          { $limit: postsPerTag },
        ]);

        return {
          tag: tagName,
          totalLikes: tagData.totalLikes,
          journalCount: tagData.journalCount,
          avgLikes: Math.round(tagData.avgLikes * 10) / 10,
          topPosts: topPosts,
        };
      })
    );

    res.json({ popularTopics: popularTopicsWithPosts });
  } catch (error) {
    console.error("Error fetching popular topics:", error);
    res
      .status(500)
      .json({ message: "Error fetching popular topics", error: error.message });
  }
});

// Get popular writers based on comprehensive engagement metrics
router.get("/popular-writers", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Get current date for recency calculations
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate to get writers with comprehensive metrics
    const popularWriters = await Journal.aggregate([
      { $match: { isPublic: true } },
      // Lookup comments for engagement calculation
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "journalId",
          as: "comments",
        },
      },
      {
        $addFields: {
          commentCount: { $size: "$comments" },
          // Calculate engagement score per post
          engagementScore: {
            $add: [
              { $multiply: ["$likeCount", 2] },
              { $multiply: ["$commentCount", 3] },
              { $multiply: [{ $size: "$saved" }, 1.5] }
            ]
          },
          // Recency factor (recent posts get more weight)
          recencyFactor: {
            $cond: [
              { $gte: ["$createdAt", sevenDaysAgo] },
              1.5, // Recent posts get 50% boost
              {
                $cond: [
                  { $gte: ["$createdAt", thirtyDaysAgo] },
                  1.2, // Posts within 30 days get 20% boost
                  1.0  // Older posts get normal weight
                ]
              }
            ]
          }
        },
      },
      {
        $group: {
          _id: "$userId",
          totalLikes: { $sum: "$likeCount" },
          totalComments: { $sum: "$commentCount" },
          totalSaves: { $sum: { $size: "$saved" } },
          journalCount: { $sum: 1 },
          avgLikes: { $avg: "$likeCount" },
          avgComments: { $avg: "$commentCount" },
          totalEngagement: { $sum: "$engagementScore" },
          avgEngagement: { $avg: "$engagementScore" },
          recentPosts: {
            $sum: {
              $cond: [
                { $gte: ["$createdAt", sevenDaysAgo] },
                1,
                0
              ]
            }
          },
          authorName: { $first: "$authorName" },
          lastPostDate: { $max: "$createdAt" },
          firstPostDate: { $min: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $addFields: {
          // Calculate days since first post (consistency factor)
          daysSinceFirstPost: {
            $floor: {
              $divide: [
                { $subtract: [now, "$firstPostDate"] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          // Calculate days since last post (activity factor)
          daysSinceLastPost: {
            $floor: {
              $divide: [
                { $subtract: [now, "$lastPostDate"] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          // Get user data
          userData: { $arrayElemAt: ["$user", 0] }
        },
      },
      {
        $addFields: {
          // Popularity Score Formula:
          // (Total Engagement * 0.4) + (Avg Engagement * 0.3) + (Consistency * 0.2) + (Recent Activity * 0.1)
          // Where:
          // - Consistency = min(journalCount / max(daysSinceFirstPost/30, 1), 5) * 10
          // - Recent Activity = max(0, 10 - daysSinceLastPost) * 2
          // - Recent Activity bonus = recentPosts * 5
          
          consistencyScore: {
            $multiply: [
              {
                $min: [
                  {
                    $divide: [
                      "$journalCount",
                      { $max: [{ $divide: ["$daysSinceFirstPost", 30] }, 1] }
                    ]
                  },
                  5
                ]
              },
              10
            ]
          },
          activityScore: {
            $add: [
              { $multiply: [{ $max: [{ $subtract: [10, "$daysSinceLastPost"] }, 0] }, 2] },
              { $multiply: ["$recentPosts", 5] }
            ]
          },
          popularityScore: {
            $add: [
              { $multiply: ["$totalEngagement", 0.4] },
              { $multiply: ["$avgEngagement", 0.3] },
              { $multiply: ["$consistencyScore", 0.2] },
              { $multiply: ["$activityScore", 0.1] }
            ]
          }
        },
      },
      { $sort: { popularityScore: -1, totalEngagement: -1 } },
      { $limit: limit },
      {
        $project: {
          userId: "$_id",
          authorName: 1,
          totalLikes: 1,
          totalComments: 1,
          totalSaves: 1,
          journalCount: 1,
          avgLikes: { $round: ["$avgLikes", 1] },
          avgComments: { $round: ["$avgComments", 1] },
          avgEngagement: { $round: ["$avgEngagement", 1] },
          recentPosts: 1,
          daysSinceLastPost: 1,
          popularityScore: { $round: ["$popularityScore", 1] },
          consistencyScore: { $round: ["$consistencyScore", 1] },
          activityScore: { $round: ["$activityScore", 1] },
          anonymousName: "$userData.anonymousName",
          bio: "$userData.bio",
          profileTheme: "$userData.profileTheme",
          currentStreak: "$userData.currentStreak",
          longestStreak: "$userData.longestStreak",
          subscriberCount: "$userData.subscriberCount",
        },
      },
    ]);

    res.json({ popularWriters });
  } catch (error) {
    console.error("Error fetching popular writers:", error);
    res.status(500).json({
      message: "Error fetching popular writers",
      error: error.message,
    });
  }
});

// Get trending journals (recent journals with high engagement)
router.get("/trending-journals", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Get journals from the last 7 days with high engagement
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trendingJournals = await Journal.aggregate([
      {
        $match: {
          isPublic: true,
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      // Lookup comment count
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "journalId",
          as: "comments",
        },
      },
      {
        $addFields: {
          commentCount: { $size: "$comments" },
          daysAgo: {
            $divide: [
              { $subtract: [new Date(), "$createdAt"] },
              1000 * 60 * 60 * 24
            ],
          },
        },
      },
      {
        $addFields: {
          baseScore: {
            $add: [
              { $ifNull: ["$likeCount", 0] },
              { $multiply: [{ $ifNull: ["$commentCount", 0] }, 2] },
            ],
          },
        },
      },
      {
        $addFields: {
          engagementScore: {
            $cond: [
              { $lte: ["$daysAgo", 7] },
              { $multiply: ["$baseScore", { $subtract: [1, { $divide: ["$daysAgo", 7] }] }] },
              0
            ],
          },
        },
      },
      { $sort: { engagementScore: -1, createdAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          title: 1,
          authorName: 1,
          likeCount: 1,
          commentCount: 1,
          createdAt: 1,
          slug: 1,
          tags: 1,
          mood: 1,
          content: 1,
          engagementScore: 1,
        },
      },
    ]);

    res.json({ trendingJournals });
  } catch (error) {
    console.error("Error fetching trending journals:", error);
    res
      .status(500)
      .json({
        message: "Error fetching trending journals",
        error: error.message,
      });
  }
});

// Get journal count for stats
router.get("/journalscount", async (req, res) => {
  try {
    const count = await Journal.countDocuments({ isPublic: true });
    res.json({ count });
  } catch (error) {
    console.error("Error counting journals:", error);
    res
      .status(500)
      .json({ message: "Error counting journals", error: error.message });
  }
});

// Route to get public journals for a user's dashboard
router.get("/journals/dashboard/public/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const journals = await Journal.find({ userId, isPublic: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "title content createdAt mood theme slug date collections tags authorName"
      );

    const totalJournals = await Journal.countDocuments({
      userId,
      isPublic: true,
    });
    const hasMore = skip + journals.length < totalJournals;

    res.json({ journals, hasMore, page, total: totalJournals });
  } catch (error) {
    console.error("Error fetching public dashboard journals:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Route to get private journals for a user's dashboard
router.get("/journals/dashboard/private/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const journals = await Journal.find({ userId, isPublic: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "title content createdAt mood theme slug date collections tags authorName"
      );

    const totalJournals = await Journal.countDocuments({
      userId,
      isPublic: false,
    });
    const hasMore = skip + journals.length < totalJournals;

    res.json({ journals, hasMore, page, total: totalJournals });
  } catch (error) {
    console.error("Error fetching private dashboard journals:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Save or unsave a journal
router.post("/journals/:journalId/save", async (req, res) => {
  const { journalId } = req.params;
  const { userId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(journalId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid Journal or User ID" });
  }

  try {
    const journal = await Journal.findById(journalId);
    const user = await User.findById(userId);

    if (!journal || !user) {
      return res.status(404).json({ message: "Journal or User not found" });
    }

    const isSaved = user.savedEntries.some(id => id.equals(journalId));

    if (isSaved) {
      // Unsave the journal
      user.savedEntries.pull(journalId);
    } else {
      // Save the journal
      user.savedEntries.push(journalId);
    }

    await user.save();

    res.status(200).json({
      message: `Journal ${isSaved ? "unsaved" : "saved"} successfully`,
      savedEntries: user.savedEntries,
    });
  } catch (error) {
    console.error("Error saving/unsaving journal:", error);
    res.status(500).json({ message: "Error saving/unsaving journal" });
  }
});

// Get all saved journals for a user
router.get("/journals/saved/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = Number.parseInt(req.query.page) || 1;
  const limit = Number.parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  try {
    const user = await User.findById(userId).populate({
      path: 'savedEntries',
      options: {
        sort: { createdAt: -1 },
        skip: skip,
        limit: limit,
      },
      populate: {
        path: 'userId',
        select: 'anonymousName profileTheme'
      }
    }).lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const totalSaved = await User.findById(userId).select('savedEntries');
    const hasMore = skip + user.savedEntries.length < totalSaved.savedEntries.length;
    
    res.status(200).json({ journals: user.savedEntries, hasMore });
  } catch (error) {
    console.error("Error fetching saved journals:", error);
    res.status(500).json({ message: "Error fetching saved journals" });
  }
});

// GET a specific journal entry by ID for editing
router.get("/journals/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid journal ID format." });
  }

  try {
    const journal = await Journal.findById(id).lean();
    if (!journal) {
      return res.status(404).json({ message: "Journal entry not found." });
    }

    res.status(200).json({ journal });
  } catch (error) {
    console.error("Error fetching journal:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

export default router;
