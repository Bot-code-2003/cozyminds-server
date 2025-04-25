// userRoutes.js
import express from "express";
import User from "../models/User.js";
import Mail from "../models/Mail.js";
import Journal from "../models/Journal.js"; // Import Journal model
import mongoose from "mongoose";

const router = express.Router();

// Handle Signup
router.post("/signup", async (req, res) => {
  try {
    const { nickname, email, password, age, gender, subscribe } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use." });
    }

    // Save new user with initial coins
    const newUser = new User({
      nickname,
      email,
      password,
      age,
      gender,
      subscribe,
      lastVisited: new Date(), // Set lastVisited for first-time user
      coins: 0, // Initialize with 0 coins
      inventory: [], // Initialize with empty inventory
    });
    await newUser.save();

    // Create welcome mail
    const welcomeMail = new Mail({
      sender: "Developer",
      title: "Welcome to Cozy Minds",
      content: `
        <div style="padding: 1.5rem; background-color: #F4FBEA; color: #3E4E3D; font-family: 'Georgia', serif; line-height: 1.7; border: 2px solid #D4E5C3; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.03); position: relative;">
          <div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background-color: #F4FBEA; padding: 0 10px; color: #A3C398; font-size: 1.2rem;">🌿</div>

          <h1 style="font-size: 1.4rem; color: #7CA280; font-weight: 600; margin-bottom: 1.2rem; text-align: center; font-family: 'Courier New', monospace;">
            Hi there, you're safe here 🍃
          </h1>

          <p style="font-size: 1rem; margin-bottom: 1.2rem;">
            I made this as a quiet little place for myself — to write, reflect, and gently learn.  
            Now it's here for you too.  
            There's no pressure. Just a calm space to pause and listen to your day.
            <br><br>
            Your words stay yours. Always private, always respected.  
            Cozy Minds is for anyone who wants to try journaling — even if it's your very first time.
          </p>

          <p style="font-size: 0.95rem; color: #6B816B; font-style: italic; border-top: 1px dashed #D4E5C3; padding-top: 1rem; text-align: right;">
            With care,  
            <br>Developer
          </p>
        </div>
      `,
      recipients: [{ userId: newUser._id, read: false }],
      mailType: "welcome",
    });

    // Create reward mail
    const rewardMail = new Mail({
      sender: "Cozy Minds Team",
      title: "Welcome Gift: 50 Coins",
      content: `
        <div style="padding: 1.5rem; background-color: #FFF8E6; color: #5D4B35; font-family: 'Georgia', serif; line-height: 1.7; border: 2px solid #F3E2B3; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.03); position: relative;">
  <div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background-color: #FFF8E6; padding: 0 10px; color: #D4B96E; font-size: 1.2rem;">🎁</div>

  <h1 style="font-size: 1.4rem; color: #C4A24C; font-weight: 600; margin-bottom: 1.2rem; text-align: center; font-family: 'Courier New', monospace;">
    Welcome to Cozy Minds! 🌙✨
  </h1>

  <p style="font-size: 1rem; margin-bottom: 1.2rem;">
    We're so glad you're here! As a warm welcome, you've received <strong>50 cozy coins</strong> to start your journey.
    <br><br>
    You can use these coins to unlock delightful themes in the Cozy Store and make your journaling space truly your own.
    <br><br>
    Stay tuned – more magical items and features are coming soon to the store, just for you!
  </p>

  <div style="text-align: center; margin: 1.5rem 0;">
    <button id="claim-reward-button" style="background-color: #D4B96E; color: white; border: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; cursor: pointer; transition: all 0.2s ease;">
      Claim Your 50 Coins
    </button>
  </div>

  <p style="font-size: 0.95rem; color: #7D6B4C; font-style: italic; border-top: 1px dashed #F3E2B3; padding-top: 1rem; text-align: right;">
    Happy journaling,  
    <br>💌 Developer
  </p>
</div>

      `,
      recipients: [{ userId: newUser._id, read: false, rewardClaimed: false }],
      mailType: "reward",
      rewardAmount: 50, // Set the reward amount explicitly
    });

    // Save both mails
    await Promise.all([welcomeMail.save(), rewardMail.save()]);

    res.status(201).json({ message: "Signup successful!", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Handle Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if password is correct
    if (user.password !== password) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    // Initialize coins and inventory if not present (for backward compatibility)
    if (user.coins === undefined) {
      user.coins = 0;
    }
    if (!user.inventory) {
      user.inventory = [];
    }

    // Check if lastVisited is on a different day
    const now = new Date();
    const lastVisited = user.lastVisited ? new Date(user.lastVisited) : null;
    let coinsEarned = 0;
    if (!lastVisited || lastVisited.toDateString() !== now.toDateString()) {
      user.coins += 10; // Award 10 coins for new day
      coinsEarned = 10;
    }

    // Update lastVisited timestamp
    user.lastVisited = now;

    // Save updated user
    await user.save();

    res.status(200).json({ message: "Login successful!", user, coinsEarned });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get number of users
router.get("/users", async (req, res) => {
  try {
    const users = await User.countDocuments();
    res.status(200).json({ users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Get user data
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Find the user
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ user: user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Update user profile
router.put("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nickname,
      email,
      age,
      gender,
      subscribe,
      currentStreak,
      longestStreak,
      lastJournaled,
      coins,
      inventory,
      lastVisited,
      activeTheme,
    } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Check if email is already in use by another user
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: id } });
      if (existingUser) {
        return res
          .status(409)
          .json({ message: "Email already in use by another account." });
      }
    }

    // Create update object with only provided fields
    const updateData = {};
    if (nickname) updateData.nickname = nickname;
    if (email) updateData.email = email;
    if (age) updateData.age = age;
    if (gender) updateData.gender = gender;
    if (subscribe !== undefined) updateData.subscribe = subscribe;
    if (currentStreak !== undefined) updateData.currentStreak = currentStreak;
    if (longestStreak !== undefined) updateData.longestStreak = longestStreak;
    if (lastJournaled) updateData.lastJournaled = lastJournaled;
    if (coins !== undefined) updateData.coins = coins;
    if (inventory) updateData.inventory = inventory;
    if (lastVisited) updateData.lastVisited = lastVisited;
    if (activeTheme !== undefined) updateData.activeTheme = activeTheme;

    // Find and update the user
    const updatedUser = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Profile updated successfully!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});
// Update user password
router.put("/user/:id/password", async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Validate password
    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long." });
    }

    // Find and update the user's password
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { password: newPassword },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Password updated successfully!",
    });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Verify user password
router.post("/verify-password", async (req, res) => {
  try {
    const { userId, password } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Find the user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Verify password
    const isValid = user.password === password;

    res.status(200).json({ valid: isValid });
  } catch (error) {
    console.error("Error verifying password:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// Delete user account
router.delete("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    // Delete all user's journal entries
    await Journal.deleteMany({ userId: id });

    // Delete the user
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "Account deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

export default router;
