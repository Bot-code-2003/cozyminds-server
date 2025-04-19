import express from "express";
import mongoose from "mongoose";
import Mail from "../models/Mail.js";
import User from "../models/User.js";

const router = express.Router();

// Send mail to all users (SiteMaster only)
router.post("/sendMail", async (req, res) => {
  try {
    const { title, content, sender = "Cozy Minds Team" } = req.body;

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
    const formattedMails = mails.map((mail) => ({
      id: mail._id,
      sender: mail.sender,
      title: mail.title,
      content: mail.content,
      date: mail.date.toISOString(),
      read: mail.recipients.find((r) => r.userId.toString() === userId).read, // Check if the user has read the mail
    }));

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

// Delete a mail for a specific user
router.delete("/mail/:id", async (req, res) => {
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
    const recipientIndex = mail.recipients.findIndex(
      (r) => r.userId.toString() === userId
    );
    if (recipientIndex === -1) {
      return res
        .status(403)
        .json({ message: "User is not a recipient of this mail." });
    }

    // Remove user from recipients
    mail.recipients.splice(recipientIndex, 1);

    // If no recipients remain, delete the mail entirely
    if (mail.recipients.length === 0) {
      await Mail.deleteOne({ _id: id });
      return res.status(200).json({ message: "Mail deleted successfully." });
    }

    // Otherwise, save the updated mail
    await mail.save();
    res.status(200).json({ message: "Mail deleted for user." });
  } catch (error) {
    console.error("Error deleting mail:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

export default router;
