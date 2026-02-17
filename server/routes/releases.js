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

function normalizeExtractedDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function collectTextFragments(value, fragments) {
  if (typeof value === "string") {
    fragments.push(value.replace(/<[^>]*>/g, " "));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectTextFragments(item, fragments));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectTextFragments(item, fragments));
  }
}

function extractDateFromText(text) {
  if (!text) return null;

  const monthNameDateMatches = text.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/gi);
  if (monthNameDateMatches) {
    for (const match of monthNameDateMatches) {
      const cleaned = match.replace(/(st|nd|rd|th)/gi, "").replace(/\s+/g, " ").trim();
      const parsed = normalizeExtractedDate(cleaned);
      if (parsed) return parsed;
    }
  }

  const dayMonthDateMatches = text.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+20\d{2}\b/gi);
  if (dayMonthDateMatches) {
    for (const match of dayMonthDateMatches) {
      const cleaned = match.replace(/(st|nd|rd|th)/gi, "").replace(/\s+/g, " ").trim();
      const parsed = normalizeExtractedDate(cleaned);
      if (parsed) return parsed;
    }
  }

  const isoMatches = text.match(/\b20\d{2}[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/g);
  if (isoMatches) {
    const parsed = normalizeExtractedDate(isoMatches[0].replace(/[/.]/g, "-"));
    if (parsed) return parsed;
  }

  const dmyMatches = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-](20\d{2})\b/g);
  if (dmyMatches) {
    const [day, month, year] = dmyMatches[0].split(/[\/.-]/);
    const parsed = normalizeExtractedDate(`${year}-${month}-${day}`);
    if (parsed) return parsed;
  }

  return null;
}

function inferReleaseDate(post) {
  if (post.releaseDate) {
    const explicitDate = normalizeExtractedDate(post.releaseDate);
    if (explicitDate) return explicitDate;
  }

  const fragments = [];
  collectTextFragments(post.title, fragments);
  collectTextFragments(post.excerpt, fragments);
  collectTextFragments(post.categories, fragments);
  collectTextFragments(post.content, fragments);

  const parsed = extractDateFromText(fragments.join(" "));
  if (parsed) return parsed;

  return normalizeExtractedDate(post.createdAt);
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
    .select("title excerpt content categories slug createdAt releaseDate releaseType includeInCalendar")
    .sort({ createdAt: -1 })
    .limit(500);

  const now = new Date();
  const oldestAllowed = new Date(now);
  oldestAllowed.setMonth(oldestAllowed.getMonth() - 2);

  const releases = posts
    .map(post => {
      const releaseDate = inferReleaseDate(post);
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
