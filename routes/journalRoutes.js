import express from "express";
import mongoose from "mongoose";
import Journal from "../models/Journal.js";
import User from "../models/User.js";
import Mail from "../models/Mail.js";
import slugify from "slugify";

const router = express.Router();

// Get all public journals with pagination, sorting, and category support
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
    if (req.query.category) {
      matchQuery.category = req.query.category;
    }
    const journals = await Journal.find(matchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    // Get comment counts for all journals in parallel
    const Comment = (await import("../models/comment.js")).default;
    const journalIds = journals.map((j) => j._id);
    const commentCounts = await Comment.aggregate([
      { $match: { journalId: { $in: journalIds } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } },
    ]);
    const commentCountMap = {};
    commentCounts.forEach((cc) => {
      commentCountMap[cc._id.toString()] = cc.count;
    });
    const journalsWithAuthor = journals.map((journal) => ({
      ...journal,
      author: journal.userId
        ? {
            userId: journal.userId._id,
            anonymousName: journal.userId.anonymousName,
            profileTheme: journal.userId.profileTheme,
          }
        : null,
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

// Get top 3 liked public journals
router.get("/journals/top-liked", async (req, res) => {
  try {
    const journals = await Journal.find({ isPublic: true, category: "journal" })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(4)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    const journalsWithAuthor = journals.map((journal) => ({
      ...journal,
      author: journal.userId
        ? {
            userId: journal.userId._id,
            anonymousName: journal.userId.anonymousName,
            profileTheme: journal.userId.profileTheme,
          }
        : null,
    }));
    res.json({ journals: journalsWithAuthor });
  } catch (error) {
    console.error("Error fetching top liked journals:", error);
    res
      .status(500)
      .json({
        message: "Error fetching top liked journals",
        error: error.message,
      });
  }
});

// Get top 3 liked public stories
router.get("/stories/top-liked", async (req, res) => {
  try {
    const stories = await Journal.find({ isPublic: true, category: "story" })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(4)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    const storiesWithAuthor = stories.map((story) => ({
      ...story,
      author: story.userId
        ? {
            userId: story.userId._id,
            anonymousName: story.userId.anonymousName,
            profileTheme: story.userId.profileTheme,
          }
        : null,
    }));
    res.json({ stories: storiesWithAuthor });
  } catch (error) {
    console.error("Error fetching top liked stories:", error);
    res
      .status(500)
      .json({
        message: "Error fetching top liked stories",
        error: error.message,
      });
  }
});

// Get all journals for a user
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
    res.status(200).json({ journals });
  } catch (error) {
    console.error("Error fetching journals:", error);
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
          const journalUrl = `https://starlitjournals.com/journals/${journal.slug}`;
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

// Save or unsave a journal
router.post("/journals/:journalId/save", async (req, res) => {
  const { journalId } = req.params;
  const { userId } = req.body;
  if (
    !mongoose.Types.ObjectId.isValid(journalId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return res.status(400).json({ message: "Invalid Journal or User ID" });
  }
  try {
    const journal = await Journal.findById(journalId);
    const user = await User.findById(userId);
    if (!journal || !user) {
      return res.status(404).json({ message: "Journal or User not found" });
    }
    const isSaved = user.savedEntries.some((id) => id.equals(journalId));
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
    const user = await User.findById(userId)
      .populate({
        path: "savedEntries",
        options: {
          sort: { createdAt: -1 },
          skip: skip,
          limit: limit,
        },
        populate: {
          path: "userId",
          select: "anonymousName profileTheme",
        },
      })
      .lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const totalSaved = await User.findById(userId).select("savedEntries");
    const hasMore =
      skip + user.savedEntries.length < totalSaved.savedEntries.length;
    res.status(200).json({ journals: user.savedEntries, hasMore });
  } catch (error) {
    console.error("Error fetching saved journals:", error);
    res.status(500).json({ message: "Error fetching saved journals" });
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
    const journals = await Journal.find(matchQuery)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    const journalsWithAuthor = journals.map((journal) => ({
      ...journal,
      author: journal.userId
        ? {
            userId: journal.userId._id,
            anonymousName: journal.userId.anonymousName,
            profileTheme: journal.userId.profileTheme,
          }
        : null,
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

// Get a specific journal by anonymousName and slug
router.get("/journals/:anonymousName/:slug", async (req, res) => {
  try {
    const { anonymousName, slug } = req.params;
    const user = await User.findOne({ anonymousName });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const journal = await Journal.findOne({ userId: user._id, slug })
      .populate("userId", "anonymousName profileTheme")
      .lean();
    if (!journal) {
      return res.status(404).json({ message: "Journal not found." });
    }
    res.status(200).json({ journal });
  } catch (error) {
    console.error("Error fetching journal by anonymousName and slug:", error);
    res
      .status(500)
      .json({ message: "Error fetching journal.", error: error.message });
  }
});

// Get trending journals (top 8 most liked of the month, fallback to latest)
router.get("/trending", async (req, res) => {
  try {
    const { category } = req.query;
    const now = new Date();
    let month, year;
    if (req.query.month) {
      [year, month] = req.query.month.split("-").map(Number);
    } else {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    // Start and end of month
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const match = {
      isPublic: true,
      createdAt: { $gte: start, $lt: end },
    };
    if (category) match.category = category;
    let journals = await Journal.find(match)
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(8)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    // Fallback to latest if none found
    // Fallback: fetch top liked posts from last 3 months (not only latest)
    if (!journals.length) {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const fallbackMatch = {
        isPublic: true,
        createdAt: { $gte: threeMonthsAgo },
      };
      if (category) fallbackMatch.category = category;

      journals = await Journal.find(fallbackMatch)
        .sort({ likeCount: -1, commentCount: -1, createdAt: -1 })
        .limit(8)
        .populate("userId", "anonymousName profileTheme")
        .lean();

      // As final fallback if still empty, go with latest public posts
      if (!journals.length) {
        const latestFallbackMatch = { isPublic: true };
        if (category) latestFallbackMatch.category = category;

        journals = await Journal.find(latestFallbackMatch)
          .sort({ createdAt: -1 })
          .limit(8)
          .populate("userId", "anonymousName profileTheme")
          .lean();
      }
    }

    // Get comment counts
    const Comment = (await import("../models/comment.js")).default;
    const journalIds = journals.map((j) => j._id);
    const commentCounts = await Comment.aggregate([
      { $match: { journalId: { $in: journalIds } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } },
    ]);
    const commentCountMap = {};
    commentCounts.forEach((cc) => {
      commentCountMap[cc._id.toString()] = cc.count;
    });
    const journalsWithAuthor = journals.map((journal) => ({
      ...journal,
      author: journal.userId
        ? {
            userId: journal.userId._id,
            anonymousName: journal.userId.anonymousName,
            profileTheme: journal.userId.profileTheme,
          }
        : null,
      commentCount: commentCountMap[journal._id.toString()] || 0,
    }));
    res.json({ journals: journalsWithAuthor });
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

// Get active discussions (top 8 most commented of the month, fallback to latest)
router.get("/active-discussions", async (req, res) => {
  try {
    const { category } = req.query;
    const now = new Date();
    let month, year;
    if (req.query.month) {
      [year, month] = req.query.month.split("-").map(Number);
    } else {
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const match = {
      isPublic: true,
    };
    if (category) match.category = category;
    // Aggregate comment counts for this month
    const Comment = (await import("../models/comment.js")).default;
    const commentAgg = await Comment.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 16 }, // get more in case some journals are not public or wrong category
    ]);
    const journalIds = commentAgg.map((c) => c._id);
    let journals = await Journal.find({ ...match, _id: { $in: journalIds } })
      .populate("userId", "anonymousName profileTheme")
      .lean();
    // Filter by category if needed
    if (category) journals = journals.filter((j) => j.category === category);
    // Attach commentCount
    const commentCountMap = {};
    commentAgg.forEach((cc) => {
      commentCountMap[cc._id.toString()] = cc.count;
    });
    journals = journals.map((journal) => ({
      ...journal,
      author: journal.userId
        ? {
            userId: journal.userId._id,
            anonymousName: journal.userId.anonymousName,
            profileTheme: journal.userId.profileTheme,
          }
        : null,
      commentCount: commentCountMap[journal._id.toString()] || 0,
    }));
    // Sort by commentCount desc
    journals.sort((a, b) => b.commentCount - a.commentCount);
    journals = journals.slice(0, 8);
    // Fallback to latest if none
    if (!journals.length) {
      const fallbackMatch = { isPublic: true };
      if (category) fallbackMatch.category = category;
      journals = await Journal.find(fallbackMatch)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate("userId", "anonymousName profileTheme")
        .lean();
      // Get comment counts for fallback
      const fallbackIds = journals.map((j) => j._id);
      const fallbackCounts = await Comment.aggregate([
        { $match: { journalId: { $in: fallbackIds } } },
        { $group: { _id: "$journalId", count: { $sum: 1 } } },
      ]);
      const fallbackCountMap = {};
      fallbackCounts.forEach((cc) => {
        fallbackCountMap[cc._id.toString()] = cc.count;
      });
      journals = journals.map((journal) => ({
        ...journal,
        author: journal.userId
          ? {
              userId: journal.userId._id,
              anonymousName: journal.userId.anonymousName,
              profileTheme: journal.userId.profileTheme,
            }
          : null,
        commentCount: fallbackCountMap[journal._id.toString()] || 0,
      }));
    }
    res.json({ journals });
  } catch (error) {
    console.error("Error fetching active discussions:", error);
    res
      .status(500)
      .json({
        message: "Error fetching active discussions",
        error: error.message,
      });
  }
});

// Get 5 recommended posts by category (optionally exclude a journal by id)
router.get("/recommendations", async (req, res) => {
  try {
    const { category, exclude } = req.query;
    if (!category || !["journal", "story"].includes(category)) {
      return res
        .status(400)
        .json({
          message: "Category is required and must be 'journal' or 'story'",
        });
    }
    const match = { isPublic: true, category };
    if (exclude && exclude.length === 24) {
      match._id = { $ne: exclude };
    }
    let journals = await Journal.find(match)
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(5)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    // Fallback to latest if not enough
    if (journals.length < 5) {
      const fallback = await Journal.find({
        isPublic: true,
        category,
        ...(exclude && exclude.length === 24 ? { _id: { $ne: exclude } } : {}),
      })
        .sort({ createdAt: -1 })
        .limit(5 - journals.length)
        .populate("userId", "anonymousName profileTheme")
        .lean();
      journals = journals.concat(fallback);
      // Deduplicate by _id
      const seen = new Set();
      journals = journals.filter((j) => {
        if (seen.has(j._id.toString())) return false;
        seen.add(j._id.toString());
        return true;
      });
    }
    // Get comment counts
    const Comment = (await import("../models/comment.js")).default;
    const journalIds = journals.map((j) => j._id);
    const commentCounts = await Comment.aggregate([
      { $match: { journalId: { $in: journalIds } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } },
    ]);
    const commentCountMap = {};
    commentCounts.forEach((cc) => {
      commentCountMap[cc._id.toString()] = cc.count;
    });
    const journalsWithAuthor = journals.map((journal) => ({
      ...journal,
      author: journal.userId
        ? {
            userId: journal.userId._id,
            anonymousName: journal.userId.anonymousName,
            profileTheme: journal.userId.profileTheme,
          }
        : null,
      commentCount: commentCountMap[journal._id.toString()] || 0,
    }));
    res.json({ journals: journalsWithAuthor });
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    res
      .status(500)
      .json({
        message: "Error fetching recommendations",
        error: error.message,
      });
  }
});

// Save a new journal (for compatibility with old frontend)
router.post("/saveJournal", async (req, res) => {
  try {
    const {
      userId,
      title,
      content,
      tags,
      collections,
      theme,
      isPublic,
      authorName,
      thumbnail,
      category,
      metaDescription,
    } = req.body;
    if (!userId || !title || !content || !tags || !collections || !category) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    // Generate a unique slug
    let baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 1;
    const Journal = (await import("../models/Journal.js")).default;
    while (await Journal.findOne({ slug })) {
      slug = `${baseSlug}-${count++}`;
    }
    const newJournal = new Journal({
      userId,
      title,
      slug,
      content,
      tags,
      collections,
      theme,
      isPublic,
      authorName: isPublic ? authorName : undefined,
      thumbnail,
      category,
      metaDescription:
        category === "story" && metaDescription ? metaDescription : undefined,
    });
    await newJournal.save();
    res
      .status(201)
      .json({ message: "Journal created successfully!", journal: newJournal });
  } catch (error) {
    console.error("Error saving journal:", error);
    res
      .status(500)
      .json({ message: "Error saving journal", error: error.message });
  }
});

router.get("/stories/latest-by-genre", async (req, res) => {
  try {
    const genres = req.query.genres
      ? req.query.genres.split(",")
      : [
          "Fantasy",
          "Horror",
          "Science Fiction",
          "Romance",
          "Mystery",
          "Adventure",
          "Drama",
          "Comedy",
        ];
    const stories = await Promise.all(
      genres.map(async (tag) => {
        const story = await Journal.findOne({
          isPublic: true,
          category: "story",
          tags: { $in: [new RegExp(`^${tag}$`, "i")] },
        })
          .sort({ createdAt: -1 })
          .populate("userId", "anonymousName profileTheme")
          .lean();
        return story ? { ...story, genre: tag } : null;
      })
    );
    const filteredStories = stories.filter((story) => story !== null);
    const commentCounts = await (
      await import("../models/comment.js")
    ).default.aggregate([
      { $match: { journalId: { $in: filteredStories.map((s) => s._id) } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } },
    ]);
    const commentCountMap = {};
    commentCounts.forEach((cc) => {
      commentCountMap[cc._id.toString()] = cc.count;
    });
    const storiesWithAuthor = filteredStories.map((story) => ({
      ...story,
      author: story.userId
        ? {
            userId: story.userId._id,
            anonymousName: story.userId.anonymousName,
            profileTheme: story.userId.profileTheme,
          }
        : null,
      commentCount: commentCountMap[story._id.toString()] || 0,
    }));
    res.json({ stories: storiesWithAuthor });
  } catch (error) {
    console.error("Error fetching latest stories by genre:", error);
    res
      .status(500)
      .json({
        message: "Error fetching latest stories by genre",
        error: error.message,
      });
  }
});

router.get("/stories/top-by-genre/:tag", async (req, res) => {
  try {
    const { tag } = req.params;
    const decodedTag = decodeURIComponent(tag);
    const stories = await Journal.find({
      isPublic: true,
      category: "story",
      tags: { $in: [new RegExp(`^${decodedTag}$`, "i")] },
    })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(5)
      .populate("userId", "anonymousName profileTheme")
      .lean();
    const commentCounts = await (
      await import("../models/comment.js")
    ).default.aggregate([
      { $match: { journalId: { $in: stories.map((s) => s._id) } } },
      { $group: { _id: "$journalId", count: { $sum: 1 } } },
    ]);
    const commentCountMap = {};
    commentCounts.forEach((cc) => {
      commentCountMap[cc._id.toString()] = cc.count;
    });
    const storiesWithAuthor = stories.map((story) => ({
      ...story,
      author: story.userId
        ? {
            userId: story.userId._id,
            anonymousName: story.userId.anonymousName,
            profileTheme: story.userId.profileTheme,
          }
        : null,
      commentCount: commentCountMap[story._id.toString()] || 0,
    }));
    res.json({ stories: storiesWithAuthor, tag: decodedTag });
  } catch (error) {
    console.error("Error fetching top stories by genre:", error);
    res
      .status(500)
      .json({
        message: "Error fetching top stories by genre",
        error: error.message,
      });
  }
});

export default router;
