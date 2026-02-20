const express = require("express");
const Post = require("../models/Post");

const router = express.Router();

function toDateOnlyString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function detectReleaseType(post) {
  if (post.releaseType === "Game" || post.releaseType === "Tech") {
    return post.releaseType;
  }

  const categoryText = Array.isArray(post.categories) ? post.categories.join(" ") : "";
  const text = `${post.title || ""} ${categoryText}`.toLowerCase();
  const gameKeywords = ["game", "gaming", "xbox", "playstation", "nintendo", "steam", "pc"];

  return gameKeywords.some(keyword => text.includes(keyword)) ? "Game" : "Tech";
}

router.get("/", async (req, res) => {
  const posts = await Post.find({ published: true, includeInCalendar: true })
    .select("title categories slug createdAt releaseDate releaseType")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const now = new Date();
  const oldestAllowed = new Date(now);
  oldestAllowed.setMonth(oldestAllowed.getMonth() - 2);

  const releases = posts
    .map(post => {
      const releaseDate = normalizeDate(post.releaseDate || post.createdAt);
      return {
        id: String(post._id),
        title: post.title,
        slug: post.slug,
        date: toDateOnlyString(releaseDate),
        type: detectReleaseType(post)
      };
    })
    .filter(item => item.date)
    .filter(item => new Date(item.date) >= oldestAllowed)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 120);

  res.json(releases);
});

module.exports = router;
