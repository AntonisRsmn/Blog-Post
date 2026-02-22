const express = require("express");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");

const router = express.Router();

function sanitizeString(value, maxLength = 160) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value) {
  return sanitizeString(value, 180).toLowerCase();
}

function isValidEmail(email) {
  const value = String(email || "").trim();
  if (!value || value.length > 180) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

router.post("/subscribe", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const source = sanitizeString(req.body?.source, 80) || "site-footer";
    const sourcePath = sanitizeString(req.body?.sourcePath, 200);
    const postId = sanitizeString(req.body?.postId, 80);
    const postSlug = sanitizeString(req.body?.postSlug, 180);
    const postTitle = sanitizeString(req.body?.postTitle, 220);
    const locale = sanitizeString(req.body?.locale, 40);
    const userAgent = sanitizeString(req.get("user-agent"), 300);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const existing = await NewsletterSubscriber.findOne({ email }).select("_id").lean();
    if (existing?._id) {
      return res.json({ success: true, alreadySubscribed: true });
    }

    await NewsletterSubscriber.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          source,
          sourcePath,
          postId,
          postSlug,
          postTitle,
          locale,
          userAgent
        }
      },
      { upsert: true, new: false }
    );

    return res.json({ success: true, alreadySubscribed: false });
  } catch {
    return res.status(500).json({ error: "Could not subscribe right now" });
  }
});

router.get("/subscribers", auth, requireStaff, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(2000, Math.floor(limitRaw)))
      : 300;

    const items = await NewsletterSubscriber.find({})
      .select("email source sourcePath postId postSlug postTitle locale createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const total = await NewsletterSubscriber.countDocuments({});

    return res.json({
      total,
      limit,
      items: Array.isArray(items) ? items : []
    });
  } catch {
    return res.status(500).json({ error: "Could not load subscribers" });
  }
});

router.delete("/subscribers", auth, requireStaff, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const result = await NewsletterSubscriber.deleteOne({ email });
    if (!result?.deletedCount) {
      return res.status(404).json({ error: "Subscriber not found" });
    }

    return res.json({ success: true, removedEmail: email });
  } catch {
    return res.status(500).json({ error: "Could not remove subscriber" });
  }
});

module.exports = router;
