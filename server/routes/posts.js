const express = require("express");
const Post = require("../models/Post");
const auth = require("../middleware/auth");
const requireUploaderOrStaff = require("../middleware/requireUploaderOrStaff");
const User = require("../models/User");
const mongoose = require("mongoose");

const router = express.Router();

function sanitizeText(value, maxLength = 300) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeSlug(value) {
  return sanitizeText(value, 180)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(value) {
  const slug = String(value || "");
  if (!slug) return false;
  return !/[/?#]/.test(slug);
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const unique = new Set();
  categories.forEach(category => {
    const safe = sanitizeText(category, 40).toUpperCase();
    if (safe) unique.add(safe);
  });
  return [...unique].slice(0, 10);
}

function normalizePostCategoriesForOutput(post) {
  if (!post || !Array.isArray(post.categories)) return post;
  return {
    ...post,
    categories: normalizeCategories(post.categories)
  };
}

function extractThumbnailFromContent(content) {
  if (!Array.isArray(content)) return "";
  const imageBlock = content.find(block => block?.type === "image");
  if (!imageBlock) return "";

  const fileValue = imageBlock?.data?.file;
  if (typeof fileValue === "string") return fileValue;
  if (fileValue && typeof fileValue.url === "string") return fileValue.url;
  if (typeof imageBlock?.data?.url === "string") return imageBlock.data.url;
  return "";
}

function toListPostPayload(post) {
  const plain = typeof post?.toObject === "function" ? post.toObject() : post;
  const resolvedThumbnail = plain?.thumbnailUrl || extractThumbnailFromContent(plain?.content);
  return {
    _id: plain?._id,
    title: plain?.title || "",
    author: plain?.author || "",
    authorId: plain?.authorId || null,
    categories: normalizeCategories(Array.isArray(plain?.categories) ? plain.categories : []),
    slug: plain?.slug || "",
    excerpt: plain?.excerpt || "",
    createdAt: plain?.createdAt || null,
    releaseDate: plain?.releaseDate || null,
    releaseType: plain?.releaseType || "",
    includeInCalendar: !!plain?.includeInCalendar,
    thumbnailUrl: resolvedThumbnail
  };
}

function buildValidatedPostPayload(input, isPartial = false) {
  const payload = {};

  if (!isPartial || typeof input.title === "string") {
    const title = sanitizeText(input.title, 180);
    if (!title) return { error: "Title is required" };
    payload.title = title;
  }

  if (!isPartial || typeof input.slug === "string") {
    const slug = normalizeSlug(input.slug);
    if (!slug || !isValidSlug(slug)) {
      return { error: "Slug is invalid. Remove / ? # characters and try again." };
    }
    payload.slug = slug;
  }

  if (Array.isArray(input.categories) || !isPartial) {
    payload.categories = normalizeCategories(input.categories);
  }

  if (Array.isArray(input.content) || !isPartial) {
    if (!Array.isArray(input.content) || input.content.length === 0) {
      return { error: "Content is required" };
    }
    if (input.content.length > 200) {
      return { error: "Content is too large" };
    }
    payload.content = input.content;
    payload.thumbnailUrl = extractThumbnailFromContent(input.content);
  }

  if (typeof input.excerpt === "string") {
    payload.excerpt = sanitizeText(input.excerpt, 400);
  } else if (!isPartial) {
    payload.excerpt = "";
  }

  if (typeof input.published === "boolean") {
    payload.published = input.published;
  } else if (!isPartial) {
    payload.published = true;
  }

  if (typeof input.includeInCalendar === "boolean") {
    payload.includeInCalendar = input.includeInCalendar;
  } else if (!isPartial) {
    payload.includeInCalendar = false;
  }

  if (typeof input.releaseType === "string") {
    const releaseType = sanitizeText(input.releaseType, 20);
    if (releaseType !== "" && releaseType !== "Game" && releaseType !== "Tech") {
      return { error: "Release type is invalid" };
    }
    payload.releaseType = releaseType;
  } else if (!isPartial) {
    payload.releaseType = "";
  }

  if (Object.prototype.hasOwnProperty.call(input, "releaseDate")) {
    if (input.releaseDate === null || input.releaseDate === "") {
      payload.releaseDate = null;
    } else {
      const parsed = new Date(input.releaseDate);
      if (Number.isNaN(parsed.getTime())) {
        return { error: "Release date is invalid" };
      }
      payload.releaseDate = parsed;
    }
  } else if (!isPartial) {
    payload.releaseDate = null;
  }

  return { value: payload };
}

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
  const listMode = String(req.query?.list || "") === "1";
  const selectFields = listMode
    ? "title author authorId categories slug excerpt createdAt releaseDate releaseType includeInCalendar thumbnailUrl content"
    : "title author authorId categories slug excerpt createdAt content releaseDate releaseType includeInCalendar thumbnailUrl";

  const posts = await Post.find({ published: true })
    .select(selectFields)
    .sort({ createdAt: -1 })
    .lean();

  if (listMode) {
    const listPayload = posts.map(toListPostPayload);

    const missingThumbnailWrites = listPayload
      .filter(item => item?._id && item.thumbnailUrl)
      .map(item => ({
        updateOne: {
          filter: { _id: item._id, $or: [{ thumbnailUrl: { $exists: false } }, { thumbnailUrl: "" }] },
          update: { $set: { thumbnailUrl: item.thumbnailUrl } }
        }
      }));

    if (missingThumbnailWrites.length) {
      Post.bulkWrite(missingThumbnailWrites, { ordered: false }).catch(() => {});
    }

    return res.json(listPayload);
  }

  res.json(posts.map(normalizePostCategoriesForOutput));
});

router.get("/manage", auth, requireUploaderOrStaff, async (req, res) => {
  const listMode = String(req.query?.list || "") === "1";
  const selectFields = listMode
    ? "title author authorId categories slug excerpt createdAt releaseDate releaseType includeInCalendar thumbnailUrl content"
    : "title author authorId categories slug excerpt createdAt content releaseDate releaseType includeInCalendar thumbnailUrl";

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
    .select(selectFields)
    .sort({ createdAt: -1 })
    .lean();

  if (listMode) {
    const listPayload = posts.map(toListPostPayload);

    const missingThumbnailWrites = listPayload
      .filter(item => item?._id && item.thumbnailUrl)
      .map(item => ({
        updateOne: {
          filter: { _id: item._id, $or: [{ thumbnailUrl: { $exists: false } }, { thumbnailUrl: "" }] },
          update: { $set: { thumbnailUrl: item.thumbnailUrl } }
        }
      }));

    if (missingThumbnailWrites.length) {
      Post.bulkWrite(missingThumbnailWrites, { ordered: false }).catch(() => {});
    }

    return res.json(listPayload);
  }

  res.json(posts.map(normalizePostCategoriesForOutput));
});

router.get("/by-slug", async (req, res) => {
  const rawSlug = sanitizeText(req.query?.slug, 180);
  if (!rawSlug) {
    return res.status(400).json({ error: "Invalid slug" });
  }

  let post = await Post.findOne({ slug: rawSlug });
  if (!post) {
    post = await Post.findOne({ slug: rawSlug.toLowerCase() });
  }

  if (!post) return res.status(404).json({ error: "Not found" });
  return res.json(normalizePostCategoriesForOutput(post.toObject()));
});

router.get("/by-id/:id", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const post = await Post.findOne({ _id: req.params.id, published: true });
  if (!post) return res.status(404).json({ error: "Not found" });
  return res.json(normalizePostCategoriesForOutput(post.toObject()));
});

router.get("/manage/:id", auth, requireUploaderOrStaff, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });

  if (user.role === "staff" && !userOwnsPost(user, post)) {
    return res.status(403).json({ error: "You can only access your own posts" });
  }

  return res.json(normalizePostCategoriesForOutput(post.toObject()));
});

// Get single post by slug
router.get("/:slug", async (req, res) => {
  const rawSlug = String(req.params.slug || "").trim();
  if (!rawSlug || rawSlug.length > 180) {
    return res.status(400).json({ error: "Invalid slug" });
  }

  let post = await Post.findOne({ slug: rawSlug });
  if (!post) {
    post = await Post.findOne({ slug: rawSlug.toLowerCase() });
  }

  if (!post) return res.status(404).json({ error: "Not found" });
  res.json(normalizePostCategoriesForOutput(post.toObject()));
});

/* ---------- ADMIN ---------- */

// Create post
router.post("/", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { value, error } = buildValidatedPostPayload(req.body, false);
  if (error) return res.status(400).json({ error });

  const author = user?.username || user?.email || "Unknown";
  const post = await Post.create({ ...value, author, authorId: user?._id });
  res.json(post);
});

// Update post
router.put("/:id", auth, requireUploaderOrStaff, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { value: updates, error } = buildValidatedPostPayload(req.body, true);
  if (error) return res.status(400).json({ error });

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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

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
