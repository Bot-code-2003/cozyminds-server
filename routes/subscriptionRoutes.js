import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Journal from "../models/Journal.js";

const router = express.Router();

// Get public profile by anonymous name
router.get("/profile/:anonymousName", async (req, res) => {
  try {
    const { anonymousName } = req.params;

    console.log(anonymousName);
    
    
    const user = await User.findOne({ anonymousName })
      .select("anonymousName currentStreak longestStreak subscriberCount bio profileTheme createdAt")
      .lean();

    console.log(user);

    if (!user) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Get public journals by this user
    const journals = await Journal.find({ 
      userId: user._id, 
      isPublic: true 
    })
      .sort({ date: -1 })
      .limit(20)
      .select("title content authorName date likeCount likes theme mood tags slug")
      .lean();

    // Get total public journal count
    const totalJournals = await Journal.countDocuments({ 
      userId: user._id, 
      isPublic: true 
    });

    res.json({
      profile: user,
      journals,
      totalJournals
    });
  } catch (error) {
    console.error("Error fetching public profile:", error);
    res.status(500).json({ message: "Error fetching profile", error: error.message });
  }
});

// Subscribe to a user
router.post("/subscribe", async (req, res) => {
  try {
    const { subscriberId, targetUserId } = req.body;

    if (!subscriberId || !targetUserId) {
      return res.status(400).json({ message: "Subscriber ID and target user ID are required" });
    }

    if (subscriberId === targetUserId) {
      return res.status(400).json({ message: "Cannot subscribe to yourself" });
    }

    // Validate user IDs
    if (!mongoose.Types.ObjectId.isValid(subscriberId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const subscriber = await User.findById(subscriberId);
    const targetUser = await User.findById(targetUserId);

    if (!subscriber || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isAlreadySubscribed = subscriber.subscribedTo.includes(targetUserId);

    if (isAlreadySubscribed) {
      // Unsubscribe
      await User.findByIdAndUpdate(subscriberId, {
        $pull: { subscribedTo: targetUserId }
      });
      await User.findByIdAndUpdate(targetUserId, {
        $pull: { subscribers: subscriberId },
        $inc: { subscriberCount: -1 }
      });
      
      res.json({ subscribed: false, message: "Unsubscribed successfully" });
    } else {
      // Subscribe
      await User.findByIdAndUpdate(subscriberId, {
        $addToSet: { subscribedTo: targetUserId }
      });
      await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { subscribers: subscriberId },
        $inc: { subscriberCount: 1 }
      });
      
      res.json({ subscribed: true, message: "Subscribed successfully" });
    }
  } catch (error) {
    console.error("Error handling subscription:", error);
    res.status(500).json({ message: "Error handling subscription", error: error.message });
  }
});

// Get subscription status
router.get("/subscription-status/:subscriberId/:targetUserId", async (req, res) => {
  try {
    const { subscriberId, targetUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(subscriberId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const subscriber = await User.findById(subscriberId).select("subscribedTo");
    
    if (!subscriber) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSubscribed = subscriber.subscribedTo.includes(targetUserId);
    res.json({ isSubscribed });
  } catch (error) {
    console.error("Error checking subscription status:", error);
    res.status(500).json({ message: "Error checking subscription status", error: error.message });
  }
});

// Get user's subscriptions with notification status
router.get("/subscriptions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const user = await User.findById(userId)
      .populate({
        path: "subscribedTo",
        select: "anonymousName subscriberCount profileTheme"
      })
      .select("subscribedTo lastNotificationCheck");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check for new journals from subscribed users
    const subscriptionsWithNotifications = await Promise.all(
      user.subscribedTo.map(async (subscribedUser) => {
        const newJournalsCount = await Journal.countDocuments({
          userId: subscribedUser._id,
          isPublic: true,
          createdAt: { $gt: user.lastNotificationCheck }
        });

        return {
          ...subscribedUser.toObject(),
          hasNewContent: newJournalsCount > 0,
          newJournalsCount
        };
      })
    );

    res.json({ subscriptions: subscriptionsWithNotifications });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ message: "Error fetching subscriptions", error: error.message });
  }
});

// Get feed from subscribed users
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

    // Get journals from subscribed users
    const subscribedJournals = await Journal.find({
      userId: { $in: user.subscribedTo },
      isPublic: true
    })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select("title content authorName date likeCount likes theme mood tags slug userId")
      .lean();

    // Get all public journals if no subscriptions or to fill the feed
    const allPublicJournals = await Journal.find({ isPublic: true })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select("title content authorName date likeCount likes theme mood tags slug userId")
      .lean();

    // Combine and deduplicate
    const combinedJournals = [...subscribedJournals];
    const existingIds = new Set(subscribedJournals.map(j => j._id.toString()));
    
    for (const journal of allPublicJournals) {
      if (!existingIds.has(journal._id.toString()) && combinedJournals.length < limit) {
        combinedJournals.push(journal);
      }
    }

    // Mark which journals are from subscribed users
    const journalsWithSubscriptionStatus = combinedJournals.map(journal => ({
      ...journal,
      isFromSubscription: user.subscribedTo.some(subId => subId.toString() === journal.userId.toString())
    }));

    const totalCount = await Journal.countDocuments({ isPublic: true });
    const hasMore = skip + combinedJournals.length < totalCount;

    res.json({
      journals: journalsWithSubscriptionStatus,
      hasMore,
      page,
      total: totalCount
    });
  } catch (error) {
    console.error("Error fetching feed:", error);
    res.status(500).json({ message: "Error fetching feed", error: error.message });
  }
});

// Update notification check timestamp
router.post("/notifications/mark-checked/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    await User.findByIdAndUpdate(userId, {
      lastNotificationCheck: new Date()
    });

    res.json({ message: "Notifications marked as checked" });
  } catch (error) {
    console.error("Error updating notification check:", error);
    res.status(500).json({ message: "Error updating notification check", error: error.message });
  }
});

export default router;
