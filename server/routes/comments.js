const express = require("express");
const Comment = require("../models/Comment");
const User = require("../models/User");
const auth = require("../middleware/auth");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const router = express.Router();

function sanitizeCommentText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 2000);
}

function getViewerId(req) {
  const token = req.cookies?.token;
  if (!token) return "";

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    return String(payload?.userId || "");
  } catch {
    return "";
  }
}

function getCommentRankScore(comment) {
  const reactions = comment?.reactions || {};
  return Number(reactions.like || 0) * 2 + Number(reactions.helpful || 0) * 2 + Number(reactions.funny || 0);
}

function scoreCommentSpam(text) {
  const value = String(text || "");
  const flags = [];
  let score = 0;

  const links = value.match(/https?:\/\//gi) || [];
  if (links.length) {
    score += Math.min(60, links.length * 22);
    flags.push("contains-links");
  }

  if (/(.)\1{5,}/u.test(value)) {
    score += 25;
    flags.push("repeated-characters");
  }

  const letters = (value.match(/[A-Za-zΑ-Ωα-ω]/gu) || []);
  const upper = (value.match(/[A-ZΑ-Ω]/gu) || []);
  if (letters.length >= 18 && upper.length / letters.length > 0.6) {
    score += 18;
    flags.push("excessive-uppercase");
  }

  if (/\b(?:buy now|free money|telegram|whatsapp|crypto|casino|bet)\b/iu.test(value)) {
    score += 22;
    flags.push("spam-keywords");
  }

  if (value.length < 4) {
    score += 14;
    flags.push("too-short");
  }

  return { score, flags };
}

router.get("/:postId", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const sort = String(req.query?.sort || "newest").toLowerCase();
  const comments = await Comment.find({ postId: req.params.postId })
    .select("authorName authorAvatar text createdAt userId reactions reactionUsers spamScore")
    .lean();

  const viewerId = getViewerId(req);

  const mapped = comments.map(comment => {
    const reactionUsers = comment?.reactionUsers && typeof comment.reactionUsers === "object"
      ? comment.reactionUsers
      : {};
    const userReaction = viewerId ? String(reactionUsers[viewerId] || "") : "";

    return {
      _id: comment._id,
      userId: comment.userId,
      authorName: comment.authorName,
      authorAvatar: comment.authorAvatar,
      text: comment.text,
      createdAt: comment.createdAt,
      reactions: {
        like: Number(comment?.reactions?.like || 0),
        helpful: Number(comment?.reactions?.helpful || 0),
        funny: Number(comment?.reactions?.funny || 0)
      },
      userReaction,
      score: getCommentRankScore(comment)
    };
  });

  mapped.sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }

    if (sort === "top") {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt) - new Date(a.createdAt);
    }

    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json(mapped.map(comment => ({
    _id: comment._id,
    userId: comment.userId,
    authorName: comment.authorName,
    authorAvatar: comment.authorAvatar,
    text: comment.text,
    createdAt: comment.createdAt,
    reactions: comment.reactions,
    userReaction: comment.userReaction
  })));
});

router.post("/:postId", auth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const text = sanitizeCommentText(req.body.text);
  if (!text) return res.status(400).json({ error: "Comment text is required" });

  const spam = scoreCommentSpam(text);
  if (spam.score >= 60) {
    return res.status(400).json({ error: "Comment looks like spam. Please edit and try again." });
  }

  const user = await User.findById(req.user.userId).select("email username avatarUrl");
  if (!user) return res.status(404).json({ error: "User not found" });

  const authorName = user.username || user.email;
  const comment = await Comment.create({
    postId: req.params.postId,
    userId: user._id,
    authorName,
    authorAvatar: user.avatarUrl || "",
    text,
    spamScore: spam.score,
    spamFlags: spam.flags
  });

  res.json({
    _id: comment._id,
    userId: comment.userId,
    authorName: comment.authorName,
    authorAvatar: comment.authorAvatar,
    text: comment.text,
    createdAt: comment.createdAt,
    reactions: {
      like: Number(comment?.reactions?.like || 0),
      helpful: Number(comment?.reactions?.helpful || 0),
      funny: Number(comment?.reactions?.funny || 0)
    },
    userReaction: ""
  });
});

router.post("/:commentId/reaction", auth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.commentId)) {
    return res.status(400).json({ error: "Invalid comment id" });
  }

  const type = String(req.body?.type || "").trim().toLowerCase();
  const allowed = new Set(["like", "helpful", "funny"]);
  if (!allowed.has(type)) {
    return res.status(400).json({ error: "Invalid reaction type" });
  }

  const comment = await Comment.findById(req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Not found" });

  const userId = String(req.user.userId || "");
  const current = String(comment.reactionUsers.get(userId) || "");

  const decrease = (reactionType) => {
    if (!reactionType || !allowed.has(reactionType)) return;
    const nextValue = Math.max(0, Number(comment.reactions?.[reactionType] || 0) - 1);
    comment.reactions[reactionType] = nextValue;
  };

  const increase = (reactionType) => {
    if (!reactionType || !allowed.has(reactionType)) return;
    const nextValue = Number(comment.reactions?.[reactionType] || 0) + 1;
    comment.reactions[reactionType] = nextValue;
  };

  let userReaction = type;
  if (current === type) {
    decrease(current);
    comment.reactionUsers.delete(userId);
    userReaction = "";
  } else {
    if (current) {
      decrease(current);
    }
    increase(type);
    comment.reactionUsers.set(userId, type);
  }

  await comment.save();

  return res.json({
    reactions: {
      like: Number(comment?.reactions?.like || 0),
      helpful: Number(comment?.reactions?.helpful || 0),
      funny: Number(comment?.reactions?.funny || 0)
    },
    userReaction
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