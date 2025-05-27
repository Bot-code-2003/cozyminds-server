// journalRoutes.js
import express from "express";
import mongoose from "mongoose";
import Journal from "../models/Journal.js";
import User from "../models/User.js";

const router = express.Router();

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

// Update the saveJournal route to handle collections and themes properly
router.post("/saveJournal", async (req, res) => {
  try {
    const {
      userId,
      title,
      content,
      mood,
      tags,
      wordCount,
      date,
      collections,
      theme,
    } = req.body;

    // Validate required fields
    if (!userId || !title || !content || !mood) {
      return res.status(400).json({
        message:
          "Missing required fields. userId, title, content, and mood are required.",
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Create new journal entry
    const newJournal = new Journal({
      userId,
      title,
      content,
      mood,
      tags,
      wordCount,
      collections: collections || ["All"], // Use the collections array from request
      theme, // Add theme to journal entry
      date: new Date(), // Proper ISO format
    });

    await newJournal.save();

    // Update user streak (independent from story)
    await updateUserStreak(userId, newJournal.date);

    // Convert to plain object to avoid circular references
    const journalObj = newJournal.toObject();

    res.status(201).json({
      message: "Journal entry saved successfully!",
      journal: journalObj,
    });
  } catch (error) {
    console.error("Error saving journal:", error);
    res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
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

// Get total count of journal entries
router.get("/journals/journalscount", async (req, res) => {
  try {
    const count = await Journal.countDocuments();
    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching journal count:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

export default router;
