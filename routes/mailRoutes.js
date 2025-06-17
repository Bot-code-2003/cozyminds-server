import express from "express";
import mongoose from "mongoose";
import Mail from "../models/Mail.js";
import User from "../models/User.js";

const router = express.Router();

// Send mail to all users (SiteMaster only)
router.post("/sendMail", async (req, res) => {
  try {
    const { title, content, sender = "Starlit Journals Team" } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res
        .status(400)
        .json({ message: "Title and content are required." });
    }

    // Fetch all users
    const users = await User.find({}, "_id");
    if (!users.length) {
      return res.status(404).json({ message: "No users found." });
    }

    // Create recipients array
    const recipients = users.map((user) => ({
      userId: user._id,
      read: false,
    }));

    // Create new mail
    const newMail = new Mail({
      sender,
      title,
      content,
      recipients,
      date: new Date(),
      expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // Mail expires after 10 days
    });

    await newMail.save();

    res.status(201).json({
      message: "Mail sent successfully to all users!",
      mail: newMail,
    });
  } catch (error) {
    console.error("Error sending mail:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get all mails for a specific user
router.get("/mails/:userId", async (req, res) => {
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

    // Find mails where the user is a recipient
    const mails = await Mail.find({
      "recipients.userId": userId,
    }).sort({ date: -1 });

    // Transform mails to match the frontend format
    const formattedMails = mails.map((mail) => {
      const recipient = mail.recipients.find(
        (r) => r.userId.toString() === userId
      );
      return {
        id: mail._id,
        sender: mail.sender,
        title: mail.title,
        content: mail.content,
        date: mail.date.toISOString(),
        expiryDate: mail.expiryDate?.toISOString(),
        read: recipient.read,
        mailType: mail.mailType,
        rewardAmount: mail.rewardAmount || 0,
        rewardClaimed: recipient.rewardClaimed || false,
      };
    });

    res.status(200).json({ mails: formattedMails });
  } catch (error) {
    console.error("Error fetching mails:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Mark a mail as read
router.put("/mail/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res.status(400).json({ message: "Invalid ID format." });
    }

    // Find the mail
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ message: "Mail not found." });
    }

    // Check if user is a recipient
    const recipient = mail.recipients.find(
      (r) => r.userId.toString() === userId
    );
    if (!recipient) {
      return res
        .status(403)
        .json({ message: "User is not a recipient of this mail." });
    }

    // Update read status
    recipient.read = true;
    await mail.save();

    res.status(200).json({ message: "Mail marked as read." });
  } catch (error) {
    console.error("Error marking mail as read:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Claim reward from mail
router.put("/mail/:id/claim-reward", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res.status(400).json({ message: "Invalid ID format." });
    }

    // Find the mail
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ message: "Mail not found." });
    }

    // Check if mail is a reward mail
    if (mail.mailType !== "reward") {
      return res
        .status(400)
        .json({ message: "This mail has no reward to claim." });
    }

    // Check if user is a recipient
    const recipient = mail.recipients.find(
      (r) => r.userId.toString() === userId
    );
    if (!recipient) {
      return res
        .status(403)
        .json({ message: "User is not a recipient of this mail." });
    }

    // Check if reward already claimed
    if (recipient.rewardClaimed) {
      return res.status(400).json({ message: "Reward already claimed." });
    }

    // Find user and update coins
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Get reward amount (default to 50 if not specified)
    const rewardAmount = mail.rewardAmount || 50;

    // Add coins to user
    user.coins = (user.coins || 0) + rewardAmount;
    await user.save();

    // Mark reward as claimed
    recipient.rewardClaimed = true;
    recipient.read = true; // Also mark as read
    await mail.save();

    res.status(200).json({
      message: `Reward of ${rewardAmount} coins claimed successfully.`,
      newCoinsBalance: user.coins,
    });
  } catch (error) {
    console.error("Error claiming reward:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Cleanup function to delete expired mails
const cleanupExpiredMails = async () => {
  try {
    const currentDate = new Date();
    const result = await Mail.deleteMany({
      expiryDate: { $lt: currentDate },
    });

    console.log(`Cleaned up ${result.deletedCount} expired mails`);
  } catch (error) {
    console.error("Error during mail cleanup:", error);
  }
};

// Run cleanup every day
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
setInterval(cleanupExpiredMails, CLEANUP_INTERVAL);

// Run cleanup once when server starts
cleanupExpiredMails();

// Delete mail
router.delete("/mail/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Mail.findByIdAndDelete(id);
    res.status(200).json({ message: "Mail deleted successfully." });
  } catch (error) {
    console.error("Error deleting mail:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

export default router;
