const express = require("express");
const Comment = require("../models/Comment");
const User = require("../models/User");
const auth = require("../middleware/auth");
const mongoose = require("mongoose");

const router = express.Router();

function sanitizeCommentText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 2000);
}

router.get("/:postId", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const comments = await Comment.find({ postId: req.params.postId })
    .sort({ createdAt: -1 })
    .select("authorName authorAvatar text createdAt userId");

  res.json(comments.map(comment => ({
    _id: comment._id,
    userId: comment.userId,
    authorName: comment.authorName,
    authorAvatar: comment.authorAvatar,
    text: comment.text,
    createdAt: comment.createdAt
  })));
});

router.post("/:postId", auth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const text = sanitizeCommentText(req.body.text);
  if (!text) return res.status(400).json({ error: "Comment text is required" });

  const user = await User.findById(req.user.userId).select("email username avatarUrl");
  if (!user) return res.status(404).json({ error: "User not found" });

  const authorName = user.username || user.email;
  const comment = await Comment.create({
    postId: req.params.postId,
    userId: user._id,
    authorName,
    authorAvatar: user.avatarUrl || "",
    text
  });

  res.json({
    _id: comment._id,
    userId: comment.userId,
    authorName: comment.authorName,
    authorAvatar: comment.authorAvatar,
    text: comment.text,
    createdAt: comment.createdAt
  });
});

router.delete("/:commentId", auth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.commentId)) {
    return res.status(400).json({ error: "Invalid comment id" });
  }

  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Not found" });

  const user = await User.findById(req.user.userId).select("role");
  const isOwner = comment.userId.toString() === req.user.userId;
  const isStaff = user?.role === "staff" || user?.role === "admin";

  if (!isOwner && !isStaff) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await Comment.findByIdAndDelete(req.params.commentId);
  res.json({ success: true });
});

module.exports = router;