import express from "express";
import mongoose from "mongoose";
import Feedback from "../models/Feedback.js";

const router = express.Router();

// Submit feedback
router.post("/feedback", async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || typeof feedback !== "string" || !feedback.trim()) {
      return res.status(400).json({ message: "Feedback is required." });
    }
    const fb = new Feedback({ feedback: feedback.trim() });
    await fb.save();
    res.status(201).json({ message: "Feedback submitted!" });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ message: "Error submitting feedback." });
  }
});

// Get all feedbacks (admin)
router.get("/feedbacks", async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    res.json({ feedbacks });
  } catch (error) {
    console.error("Error fetching feedbacks:", error);
    res.status(500).json({ message: "Error fetching feedbacks." });
  }
});

export default router; 