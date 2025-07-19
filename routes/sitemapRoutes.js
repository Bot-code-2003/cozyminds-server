import express from "express";
import Journal from "../models/Journal.js";

const router = express.Router();

// Public journal slugs (category = "journal")
router.get("/sitemap/journals", async (req, res) => {
  try {
    const journals = await Journal.find({ isPublic: true, category: "journal" }).select("slug authorName");
    const results = journals.map(journal => ({
      slug: journal.slug,
      author: journal.authorName
    }));
    res.json(results);
  } catch (error) {
    console.error("❌ Error fetching journal slugs:", error);
    res.status(500).json({ message: "Error fetching journal slugs", error: error.message });
  }
});

// Public story slugs (category = "story")
router.get("/sitemap/stories", async (req, res) => {
  try {
    const stories = await Journal.find({ isPublic: true, category: "story" }).select("slug authorName");
    const results = stories.map(story => ({
      slug: story.slug,
      author: story.authorName
    }));
    res.json(results);
  } catch (error) {
    console.error("❌ Error fetching story slugs:", error);
    res.status(500).json({ message: "Error fetching story slugs", error: error.message });
  }
});

export default router;
