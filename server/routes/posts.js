const express = require("express");
const Post = require("../models/Post");
const auth = require("../middleware/auth");

const router = express.Router();

/* ---------- PUBLIC ---------- */

// Get all published posts
router.get("/", async (req, res) => {
  const posts = await Post.find({ published: true })
    .select("title slug excerpt createdAt")
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
router.post("/", auth, async (req, res) => {
  const post = await Post.create(req.body);
  res.json(post);
});

// Update post
router.put("/:id", auth, async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, req.body, {
    new: true
  });
  res.json(post);
});

// Delete post
router.delete("/:id", auth, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
