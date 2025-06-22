import express from "express";
import Journal from "../models/Journal.js";

const router = express.Router();

// Get all public journal slugs for sitemap
router.get("/sitemap/journals", async (req, res) => {
  try {
    const journals = await Journal.find({ isPublic: true }).select("slug");
    const slugs = journals.map(journal => journal.slug);
    res.json(slugs);
  } catch (error) {
    console.error("Error fetching journal slugs for sitemap:", error);
    res.status(500).json({
      message: "Error fetching journal slugs for sitemap",
      error: error.message,
    });
  }
});

export default router; 