const express = require("express");
const Post = require("../models/Post");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const User = require("../models/User");

const router = express.Router();

/* ---------- PUBLIC ---------- */

// Get all published posts
router.get("/", async (req, res) => {
  const posts = await Post.find({ published: true })
    .select("title author authorId slug excerpt createdAt content")
    .sort({ createdAt: -1 });

  res.json(posts);
});

// Get single post by slug
router.get("/:slug", async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug });
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json(post);
});

/* ---------- ADMIN ---------- */

// Create post
router.post("/", auth, requireStaff, async (req, res) => {
  const user = await User.findById(req.user.userId).select("username email");
  const author = user?.username || user?.email || "Unknown";
  const post = await Post.create({ ...req.body, author, authorId: user?._id });
  res.json(post);
});

// Update post
router.put("/:id", auth, requireStaff, async (req, res) => {
  const updates = { ...req.body };
  delete updates.author;
  delete updates.authorId;

  const existing = await Post.findById(req.params.id).select("author authorId");
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (!existing.author) {
    const user = await User.findById(req.user.userId).select("username email");
    updates.author = user?.username || user?.email || "Unknown";
    updates.authorId = user?._id;
  }

  const post = await Post.findByIdAndUpdate(req.params.id, updates, {
    new: true
  });
  res.json(post);
});

// Delete post
router.delete("/:id", auth, requireStaff, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
