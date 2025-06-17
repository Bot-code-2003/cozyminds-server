import express from "express";
import mongoose from "mongoose";
import Journal from "../models/Journal.js";
import User from "../models/User.js";

const router = express.Router();

// Get public journals with pagination and sorting
router.get("/journals/public", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
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

    // Get journals with comment counts
    const journals = await Journal.aggregate([
      { $match: { isPublic: true } },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "journalId",
          as: "comments"
        }
      },
      {
        $addFields: {
          commentCount: { $size: "$comments" }
        }
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
          commentCount: 1
        }
      },
      { $sort: sortOption },
      { $skip: skip },
      { $limit: limit }
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
    console.error("Error fetching public journals:", error);
    res.status(500).json({
      message: "Error fetching public journals",
      error: error.message,
    });
  }
});

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

    console.log(`User ${userId} subscribedTo:`, user.subscribedTo);

    if (!user.subscribedTo.length) {
      return res.json({
        journals: [],
        hasMore: false,
        page,
        limit,
        total: 0,
        message: "No subscriptions found",
      });
    }

    const journals = await Journal.find({
      userId: { $in: user.subscribedTo },
      isPublic: true,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "title content authorName createdAt likeCount likes theme mood tags slug isFromSubscription"
      )
      .lean();

    console.log(`Found ${journals.length} journals for feed`);

    journals.forEach((journal) => {
      journal.isFromSubscription = true;
    });

    const totalJournals = await Journal.countDocuments({
      userId: { $in: user.subscribedTo },
      isPublic: true,
    });
    const hasMore = skip + journals.length < totalJournals;

    res.json({
      journals,
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

router.get("/journals/journalscount", async (req, res) => {
  try {
    const count = await Journal.countDocuments();
    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching journal count:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

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

// Get journal entries for a user
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

router.get("/journals/singlepublic/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const journal = await Journal.findOne({ slug, isPublic: true }).populate({
      path: "userId",
      select: "anonymousName",
    });

    if (!journal) return res.status(404).json({ message: "Journal not found" });

    const transformedJournal = {
      ...journal.toObject(),
      author: { anonymousName: journal.userId.anonymousName },
    };

    res.json(transformedJournal);
  } catch (error) {
    console.error("Error fetching public journal:", error);
    res
      .status(500)
      .json({ message: "Error fetching public journal", error: error.message });
  }
});

// Add this route to get comment count for journals
router.get("/journals/with-comments", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const sort = req.query.sort || "-createdAt"
    const skip = (page - 1) * limit

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Invalid page or limit value" })
    }

    let sortOption
    switch (sort) {
      case "likeCount":
        sortOption = { likeCount: -1, createdAt: -1 }
        break
      case "createdAt":
        sortOption = { createdAt: 1 }
        break
      case "-createdAt":
        sortOption = { createdAt: -1 }
        break
      default:
        return res.status(400).json({ message: "Invalid sort parameter" })
    }

    // Aggregate to get journals with comment counts
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
        },
      },
      { $sort: sortOption },
      { $skip: skip },
      { $limit: limit },
    ])

    const totalJournals = await Journal.countDocuments({ isPublic: true })
    const hasMore = skip + journals.length < totalJournals

    res.json({
      journals,
      hasMore,
      page,
      limit,
      total: totalJournals,
    })
  } catch (error) {
    console.error("Error fetching journals with comments:", error)
    res.status(500).json({
      message: "Error fetching journals",
      error: error.message,
    })
  }
})

export default router;
