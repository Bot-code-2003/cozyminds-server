import express from "express"
import mongoose from "mongoose"
import Comment from "../models/Comment.js"
import Journal from "../models/Journal.js"
import User from "../models/User.js"

const router = express.Router()

// Get comments for a journal with pagination
router.get("/comments/:journalId", async (req, res) => {
  try {
    const { journalId } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    if (!mongoose.Types.ObjectId.isValid(journalId)) {
      return res.status(400).json({ message: "Invalid journal ID format" })
    }

    if (page < 1 || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Invalid page or limit value" })
    }

    // Verify journal exists and is public
    const journal = await Journal.findOne({ _id: journalId, isPublic: true })
    if (!journal) {
      return res.status(404).json({ message: "Journal not found or not public" })
    }

    const comments = await Comment.find({ journalId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()

    const totalComments = await Comment.countDocuments({ journalId })
    const hasMore = skip + comments.length < totalComments

    res.json({
      comments,
      hasMore,
      page,
      limit,
      total: totalComments,
    })
  } catch (error) {
    console.error("Error fetching comments:", error)
    res.status(500).json({ message: "Error fetching comments", error: error.message })
  }
})

// Create a new comment
router.post("/comments", async (req, res) => {
  try {
    const { journalId, userId, content, parentId, authorName } = req.body

    if (!journalId || !userId || !content || !authorName) {
      return res.status(400).json({ message: "Missing required fields" })
    }

    if (!mongoose.Types.ObjectId.isValid(journalId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" })
    }

    if (parentId && !mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({ message: "Invalid parent comment ID format" })
    }

    // Verify journal exists and is public
    const journal = await Journal.findOne({ _id: journalId, isPublic: true })
    if (!journal) {
      return res.status(404).json({ message: "Journal not found or not public" })
    }

    // Verify user exists
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // If it's a reply, verify parent comment exists
    if (parentId) {
      const parentComment = await Comment.findById(parentId)
      if (!parentComment) {
        return res.status(404).json({ message: "Parent comment not found" })
      }
    }

    const comment = new Comment({
      journalId,
      userId,
      content: content.trim(),
      authorName,
      parentId: parentId || null,
    })

    await comment.save()

    res.status(201).json({ comment })
  } catch (error) {
    console.error("Error creating comment:", error)
    res.status(500).json({ message: "Error creating comment", error: error.message })
  }
})

// Like/Unlike a comment
router.post("/comments/:commentId/like", async (req, res) => {
  try {
    const { commentId } = req.params
    const { userId } = req.body

    if (!userId) {
      return res.status(401).json({ message: "User ID is required" })
    }

    if (!mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" })
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    const isLiked = comment.likes.includes(userId)

    if (isLiked) {
      comment.likes = comment.likes.filter((id) => id.toString() !== userId)
      comment.likeCount = Math.max(0, comment.likeCount - 1)
    } else {
      comment.likes.push(userId)
      comment.likeCount += 1
    }

    await comment.save()

    res.json({
      likeCount: comment.likeCount,
      isLiked: !isLiked,
    })
  } catch (error) {
    console.error("Error updating comment like status:", error)
    res.status(500).json({ message: "Error updating like status", error: error.message })
  }
})

// Update a comment
router.put("/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params
    const { userId, content } = req.body

    if (!userId || !content) {
      return res.status(400).json({ message: "Missing required fields" })
    }

    if (!mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" })
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    // Check if user owns the comment
    if (comment.userId.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to edit this comment" })
    }

    comment.content = content.trim()
    comment.isEdited = true
    await comment.save()

    res.json({ comment })
  } catch (error) {
    console.error("Error updating comment:", error)
    res.status(500).json({ message: "Error updating comment", error: error.message })
  }
})

// Delete a comment
router.delete("/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params
    const { userId } = req.body

    if (!userId) {
      return res.status(401).json({ message: "User ID is required" })
    }

    if (!mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" })
    }

    const comment = await Comment.findById(commentId)
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" })
    }

    // Check if user owns the comment
    if (comment.userId.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this comment" })
    }

    // Delete the comment and any replies
    await Comment.deleteMany({
      $or: [{ _id: commentId }, { parentId: commentId }],
    })

    res.json({ message: "Comment deleted successfully" })
  } catch (error) {
    console.error("Error deleting comment:", error)
    res.status(500).json({ message: "Error deleting comment", error: error.message })
  }
})

// Get comment count for a journal
router.get("/comments/:journalId/count", async (req, res) => {
  try {
    const { journalId } = req.params

    if (!mongoose.Types.ObjectId.isValid(journalId)) {
      return res.status(400).json({ message: "Invalid journal ID format" })
    }

    const count = await Comment.countDocuments({ journalId })
    res.json({ count })
  } catch (error) {
    console.error("Error fetching comment count:", error)
    res.status(500).json({ message: "Error fetching comment count", error: error.message })
  }
})

export default router
