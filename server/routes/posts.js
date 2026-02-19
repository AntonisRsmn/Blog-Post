const express = require("express");
const Post = require("../models/Post");
const auth = require("../middleware/auth");
const requireUploaderOrStaff = require("../middleware/requireUploaderOrStaff");
const User = require("../models/User");

const router = express.Router();

async function getCurrentUser(req) {
  return User.findById(req.user.userId).select("_id role username email");
}

function userOwnsPost(user, post) {
  if (!user || !post) return false;

  if (post.authorId && String(post.authorId) === String(user._id)) {
    return true;
  }

  if (!post.authorId) {
    const author = String(post.author || "").trim().toLowerCase();
    const username = String(user.username || "").trim().toLowerCase();
    const email = String(user.email || "").trim().toLowerCase();
    return !!author && (author === username || author === email);
  }

  return false;
}

/* ---------- PUBLIC ---------- */

// Get all published posts
router.get("/", async (req, res) => {
  const posts = await Post.find({ published: true })
    .select("title author authorId categories slug excerpt createdAt content releaseDate releaseType includeInCalendar")
    .sort({ createdAt: -1 });

  res.json(posts);
});

router.get("/manage", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const baseQuery = user.role === "admin"
    ? {}
    : {
        $or: [
          { authorId: user._id },
          { author: user.username || user.email }
        ]
      };

  const posts = await Post.find(baseQuery)
    .select("title author authorId categories slug excerpt createdAt content releaseDate releaseType includeInCalendar")
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
router.post("/", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  const author = user?.username || user?.email || "Unknown";
  const post = await Post.create({ ...req.body, author, authorId: user?._id });
  res.json(post);
});

// Update post
router.put("/:id", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const updates = { ...req.body };
  delete updates.author;
  delete updates.authorId;

  const existing = await Post.findById(req.params.id).select("author authorId");
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (user.role === "staff" && !userOwnsPost(user, existing)) {
    return res.status(403).json({ error: "You can only edit your own posts" });
  }

  if (!existing.author) {
    updates.author = user?.username || user?.email || "Unknown";
    updates.authorId = user?._id;
  } else if (!existing.authorId && user.role === "staff") {
    updates.authorId = user._id;
  }

  const post = await Post.findByIdAndUpdate(req.params.id, updates, {
    new: true
  });
  res.json(post);
});

// Delete post
router.delete("/:id", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = await Post.findById(req.params.id).select("author authorId");
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (user.role === "staff" && !userOwnsPost(user, existing)) {
    return res.status(403).json({ error: "You can only delete your own posts" });
  }

  await Post.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
