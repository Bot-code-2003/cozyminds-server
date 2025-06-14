// journalRoutes.js
import express from "express";
import mongoose from "mongoose";
import Journal from "../models/Journal.js";
import User from "../models/User.js";


const router = express.Router();

// Get public journals with pagination
router.get("/journals/public", async (req, res) => {
  try {
    // Extract page and limit from query parameters, with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; // Default to 10 journals per page
    const skip = (page - 1) * limit; // Calculate how many documents to skip

    // Input validation
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Invalid page or limit value" });
    }

    // Fetch journals
    const journals = await Journal.find({ isPublic: true })
      .sort({ date: -1 }) // Sort by date in descending order
      .skip(skip) // Skip documents for pagination
      .limit(limit) // Limit the number of documents
      .select("title content authorName date likeCount likes theme mood tags slug"); // Select fields

    // Count total public journals to determine if more are available
    const totalJournals = await Journal.countDocuments({ isPublic: true });
    const hasMore = skip + journals.length < totalJournals; // Check if more journals exist

    // Return journals and pagination metadata
    res.json({
      journals,
      hasMore,
      page,
      limit,
      total: totalJournals,
    });
  } catch (error) {
    console.error("Error fetching public journals:", error);
    res.status(500).json({ message: "Error fetching public journals", error: error.message });
  }
});

// Get the 3 most recent journal entries for a user
router.get("/journals/recent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Fetch the 3 most recent journal entries
    const recentJournals = await Journal.find({ userId })
      .sort({ date: -1 }) // Newest first
      .limit(3)
      .lean(); // Convert to plain JavaScript objects

    res.status(200).json({ recentJournals });
  } catch (error) {
    console.error("Error fetching recent journals:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// MOVE THIS ROUTE BEFORE THE PARAMETERIZED ROUTES
// Get total count of journal entries
router.get("/journals/journalscount", async (req, res) => {
  try {
    const count = await Journal.countDocuments();
    console.log("Number of journal entries:", count);

    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching journal count:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update user streak (independent from story)
async function updateUserStreak(userId, journalDate) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const currentDate = new Date(journalDate);
    currentDate.setHours(0, 0, 0, 0); // normalize

    const lastJournaledDate = user.lastJournaled
      ? new Date(user.lastJournaled)
      : null;

    if (lastJournaledDate) {
      lastJournaledDate.setHours(0, 0, 0, 0); // normalize
    }

    // If already journaled on the same day → no streak change
    if (
      lastJournaledDate &&
      lastJournaledDate.getTime() === currentDate.getTime()
    ) {
      return;
    }

    // Determine streak
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

// Function to generate SEO-friendly slug
const generateSlug = async (title, Journal) => {
  // Handle invalid inputs
  if (!title || typeof title !== 'string') {
    return '';
  }

  // Common stop words to remove (optional, for concise slugs)
  const stopWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in',
    'into', 'like', 'near', 'nor', 'of', 'on', 'onto', 'or', 'over',
    'the', 'to', 'with', 'yet',
  ]);

  // Replace special characters with meaningful equivalents
  const replacements = {
    '&': 'and',
    '@': 'at',
    '#': 'number',
    '%': 'percent',
    '$': 'dollar',
  };

  let slug = title
    .toLowerCase()
    .trim(); // Remove leading/trailing whitespace

  // Apply special character replacements
  for (const [char, replacement] of Object.entries(replacements)) {
    slug = slug.replaceAll(char, ` ${replacement} `);
  }

  // Normalize diacritics (e.g., café → cafe)
  slug = slug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Remove stop words
  const words = slug.split(/\s+/).filter(word => !stopWords.has(word));
  slug = words.join(' ');

  // Replace non-alphanumeric with hyphens
  slug = slug
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Truncate to 60 characters at word boundary
  const maxLength = 60;
  if (slug.length > maxLength) {
    const truncated = slug.substring(0, maxLength);
    slug = truncated.substring(0, truncated.lastIndexOf('-')) || truncated;
  }

  // Default slug if empty
  if (!slug) {
    slug = 'journal';
  }

  // Check uniqueness and append number if needed
  let baseSlug = slug;
  let counter = 1;
  let uniqueSlug = slug;

  while (await Journal.findOne({ slug: uniqueSlug })) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
};

// Update the saveJournal route to handle privacy
router.post("/saveJournal", async (req, res) => {
  try {
    const {
      userId, // Get userId from request body
      title,
      content,
      mood,
      tags,
      collections,
      theme,
      isPublic,
      authorName,
    } = req.body;

    // Validate required fields
    if (!userId || !title || !content || !mood) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate authorName for public journals
    if (isPublic && !authorName) {
      return res.status(400).json({ message: "Author name is required for public journals" });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate slug from title
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
    res.status(500).json({ message: "Error saving journal", error: error.message });
  }
});

// Delete a collection
router.delete("/collection/:userId/:collection", async (req, res) => {
  try {
    const { userId, collection } = req.params;
    const decodedCollection = decodeURIComponent(collection);

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Don't allow deleting the "All" collection
    if (decodedCollection === "All") {
      return res.status(400).json({
        message:
          "Cannot delete the 'All' collection as it is a system collection.",
      });
    }

    // Find all journals in this collection
    const journals = await Journal.find({
      userId,
      collections: decodedCollection,
    });

    if (journals.length === 0) {
      return res
        .status(404)
        .json({ message: "Collection not found or empty." });
    }

    // Update all journals in this collection to remove the collection from the collections array
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

// THIS ROUTE SHOULD COME AFTER THE SPECIFIC ROUTES
// Get Journal Entries for a User
router.get("/journals/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Get all journal entries for the user and convert to plain objects
    const journals = await Journal.find({ userId }).sort({ date: -1 }).lean();

    // Get all unique collections from journal entries
    const collections = [];
    journals.forEach((journal) => {
      if (journal.collections && Array.isArray(journal.collections)) {
        journal.collections.forEach((collection) => {
          if (!collections.includes(collection)) {
            collections.push(collection);
          }
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

    // Validate journal ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid journal ID format." });
    }

    // Find the journal entry and convert to plain object
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

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Get all journal entries for the user in the specified collection
    // or all journals if collection is "All"
    const query = { userId };
    if (collection !== "All") {
      query.collections = collection; // Use collections array field
    }

    const journals = await Journal.find(query).sort({ date: -1 }).lean();

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

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Find all journals with this tag
    const journals = await Journal.find({
      userId,
      tags: decodedTag,
    });

    if (journals.length === 0) {
      return res.status(404).json({ message: "Tag not found in any journal." });
    }

    // Remove the tag from all journals
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

    // Validate journal ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid journal ID format." });
    }

    // Find and delete the journal entry
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

    if (!userId) {
      return res.status(401).json({ message: "User ID is required" });
    }

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Validate journal ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid journal ID format." });
    }

    const journal = await Journal.findById(id);
    if (!journal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    const isLiked = journal.likes.includes(userId);
    if (isLiked) {
      // Unlike
      journal.likes = journal.likes.filter(id => id.toString() !== userId);
      journal.likeCount = Math.max(0, journal.likeCount - 1);
    } else {
      // Like
      journal.likes.push(userId);
      journal.likeCount += 1;
    }

    await journal.save();
    res.json({ 
      likeCount: journal.likeCount,
      isLiked: !isLiked
    });
  } catch (error) {
    console.error("Error updating like status:", error);
    res.status(500).json({ message: "Error updating like status" });
  }
});

// Get single public journal by slug
router.get("/journals/singlepublic/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    console.log(slug);
    
    
    const journal = await Journal.findOne({ 
      slug,
      isPublic: true 
    }).populate("title content authorName date likeCount likes theme mood tags slug");

    console.log(journal);
    

    if (!journal) {
      return res.status(404).json({ message: "Journal not found" });
    }

    res.json(journal);
  } catch (error) {
    console.error("Error fetching public journal:", error);
    res.status(500).json({ message: "Error fetching public journal", error: error.message });
  }
});

export default router;
