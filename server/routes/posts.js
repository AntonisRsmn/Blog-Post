const express = require("express");
const Post = require("../models/Post");
const auth = require("../middleware/auth");
const requireUploaderOrStaff = require("../middleware/requireUploaderOrStaff");
const User = require("../models/User");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const FEATURED_POST_LIMIT = 6;

const summarizeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Summary limit reached. Try again later." }
});

function sanitizeText(value, maxLength = 300) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    metaDescription: plain?.metaDescription || "",
    viewCount: Number(plain?.viewCount || 0),
    createdAt: plain?.createdAt || null,
    releaseDate: plain?.releaseDate || null,
    releaseType: plain?.releaseType || "",
    includeInCalendar: !!plain?.includeInCalendar,
    featuredManual: !!plain?.featuredManual,
    featuredAddedAt: plain?.featuredAddedAt || null,
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

  if (typeof input.metaDescription === "string") {
    payload.metaDescription = sanitizeText(input.metaDescription, 220);
  } else if (!isPartial) {
    payload.metaDescription = "";
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

function collectTextValues(value, result) {
  if (typeof value === "string") {
    result.push(value.replace(/<[^>]*>/g, " "));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectTextValues(item, result));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectTextValues(item, result));
  }
}

function extractPostPlainText(post) {
  const values = [];
  collectTextValues(post?.content || [], values);

  return values
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAnalyticsBaseQuery(user) {
  return user.role === "admin"
    ? { published: true }
    : {
        published: true,
        $or: [
          { authorId: user._id },
          { author: user.username || user.email }
        ]
      };
}

function buildAnalyticsPayload(posts) {
  const orderedPosts = Array.isArray(posts) ? posts : [];

  const totals = {
    posts: orderedPosts.length,
    views: orderedPosts.reduce((sum, post) => sum + Number(post?.viewCount || 0), 0)
  };

  const rankedPosts = orderedPosts.map((post, index) => ({
    rank: index + 1,
    _id: post._id,
    title: post.title || "Untitled",
    slug: post.slug || "",
    views: Number(post.viewCount || 0)
  }));

  const categoryMap = new Map();
  const authorMap = new Map();

  orderedPosts.forEach(post => {
    const views = Number(post?.viewCount || 0);
    const categories = Array.isArray(post?.categories) && post.categories.length
      ? post.categories
      : ["UNCATEGORIZED"];

    categories.forEach(category => {
      const key = sanitizeText(category, 50).toUpperCase() || "UNCATEGORIZED";
      categoryMap.set(key, (categoryMap.get(key) || 0) + views);
    });

    const author = sanitizeText(post?.author, 80) || "Unknown";
    authorMap.set(author, (authorMap.get(author) || 0) + views);
  });

  const rankedCategories = [...categoryMap.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([name, views], index) => ({ rank: index + 1, name, views }));

  const rankedAuthors = [...authorMap.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([name, views], index) => ({ rank: index + 1, name, views }));

  return {
    totals,
    rankedPosts,
    rankedCategories,
    rankedAuthors,
    topPosts: rankedPosts.slice(0, 10),
    topCategories: rankedCategories.slice(0, 10),
    topAuthors: rankedAuthors.slice(0, 10)
  };
}

function buildFallbackSummary(post) {
  const excerpt = sanitizeText(post?.excerpt, 280);
  if (excerpt) return excerpt;

  const body = extractPostPlainText(post);
  if (!body) return "Η σύνοψη δεν είναι διαθέσιμη για αυτό το άρθρο ακόμα.";
  if (body.length <= 280) return body;
  return `${body.slice(0, 277).trimEnd()}...`;
}

async function generateAiSummary(post) {
  const providerSetting = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  const groqApiKey = String(process.env.GROQ_API_KEY || "").trim();
  const openAiApiKey = String(process.env.OPENAI_API_KEY || "").trim();

  const providers = [];
  const addGroq = () => {
    if (!groqApiKey) return;
    providers.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqApiKey,
      model: String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim()
    });
  };
  const addOpenAi = () => {
    if (!openAiApiKey) return;
    providers.push({
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openAiApiKey,
      model: String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim()
    });
  };

  if (providerSetting === "groq") {
    addGroq();
  } else if (providerSetting === "openai") {
    addOpenAi();
  } else {
    addGroq();
    addOpenAi();
  }

  if (!providers.length) {
    return { summary: buildFallbackSummary(post), source: "fallback" };
  }

  const title = sanitizeText(post?.title, 200);
  const excerpt = sanitizeText(post?.excerpt, 400);
  const contentText = extractPostPlainText(post).slice(0, 7000);

  const prompt = [
    `Title: ${title}`,
    excerpt ? `Existing excerpt: ${excerpt}` : "",
    `Content: ${contentText}`
  ].filter(Boolean).join("\n\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    for (const provider of providers) {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.3,
          max_tokens: 180,
          messages: [
            {
              role: "system",
              content: "Δημιουργείς σύντομες περιλήψεις άρθρων για αναγνώστες ιστοσελίδας. Η απάντηση ΠΑΝΤΑ στα Ελληνικά. Κράτα το κείμενο σαφές και αντικειμενικό, 2 έως 4 μικρές προτάσεις, χωρίς bullets."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      const raw = payload?.choices?.[0]?.message?.content;
      const summary = sanitizeText(raw, 520);

      if (!summary) {
        continue;
      }

      return { summary, source: provider.name };
    }

    return { summary: buildFallbackSummary(post), source: "fallback" };
  } catch {
    return { summary: buildFallbackSummary(post), source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}

/* ---------- PUBLIC ---------- */

// Get all published posts
router.get("/", async (req, res) => {
  const listMode = String(req.query?.list || "") === "1";
  const selectFields = listMode
    ? "title author authorId categories slug excerpt metaDescription createdAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl content"
    : "title author authorId categories slug excerpt metaDescription createdAt content releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl";

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
    ? "title author authorId categories slug excerpt metaDescription createdAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl content"
    : "title author authorId categories slug excerpt metaDescription createdAt content releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl";

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

router.get("/by-author", async (req, res) => {
  const author = sanitizeText(req.query?.author, 120);
  if (!author) return res.status(400).json({ error: "Author is required" });

  const pattern = new RegExp(`^${escapeRegex(author)}$`, "i");
  const posts = await Post.find({ published: true, author: pattern })
    .select("title author authorId categories slug excerpt metaDescription createdAt content releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl viewCount")
    .sort({ createdAt: -1 })
    .lean();

  return res.json(posts.map(toListPostPayload));
});

router.post("/track-view", async (req, res) => {
  const rawId = String(req.body?.id || "").trim();
  const rawSlug = sanitizeText(req.body?.slug, 180);
  const now = new Date();

  let query = null;
  if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
    query = { _id: rawId, published: true };
  } else if (rawSlug) {
    query = { slug: rawSlug, published: true };
  }

  if (!query) return res.status(400).json({ error: "Post id or slug is required" });

  const updated = await Post.findOneAndUpdate(
    query,
    { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } },
    { new: true }
  ).select("_id viewCount");

  if (!updated && rawSlug) {
    const fallback = await Post.findOneAndUpdate(
      { slug: rawSlug.toLowerCase(), published: true },
      { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } },
      { new: true }
    ).select("_id viewCount");

    if (!fallback) return res.status(404).json({ error: "Post not found" });
    return res.json({ success: true, viewCount: Number(fallback.viewCount || 0) });
  }

  if (!updated) return res.status(404).json({ error: "Post not found" });
  return res.json({ success: true, viewCount: Number(updated.viewCount || 0) });
});

router.post("/summarize", summarizeLimiter, async (req, res) => {
  const rawId = String(req.body?.id || "").trim();
  const rawSlug = sanitizeText(req.body?.slug, 180);

  let post = null;

  if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
    post = await Post.findOne({ _id: rawId, published: true }).lean();
  }

  if (!post && rawSlug) {
    post = await Post.findOne({ slug: rawSlug, published: true }).lean();
    if (!post) {
      post = await Post.findOne({ slug: rawSlug.toLowerCase(), published: true }).lean();
    }
  }

  if (!post) {
    return res.status(404).json({ error: "Post not found." });
  }

  const result = await generateAiSummary(post);
  return res.json(result);
});

router.get("/manage/by-id/:id", auth, requireUploaderOrStaff, async (req, res) => {
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

router.get("/manage/featured", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage featured posts" });
  }

  const featuredPosts = await Post.find({ featuredManual: true })
    .select("title author authorId categories slug excerpt metaDescription createdAt releaseDate releaseType includeInCalendar featuredManual featuredAddedAt thumbnailUrl content")
    .sort({ featuredAddedAt: -1, createdAt: -1 })
    .limit(FEATURED_POST_LIMIT)
    .lean();

  return res.json(featuredPosts.map(toListPostPayload));
});

router.post("/manage/featured", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage featured posts" });
  }

  const postId = String(req.body?.postId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const targetPost = await Post.findById(postId).select("_id featuredManual");
  if (!targetPost) return res.status(404).json({ error: "Post not found" });

  const featuredNow = await Post.find({ featuredManual: true })
    .select("_id featuredAddedAt")
    .sort({ featuredAddedAt: 1, createdAt: 1 })
    .lean();

  let removedCount = 0;
  const targetAlreadyFeatured = featuredNow.some(item => String(item._id) === String(targetPost._id));

  if (!targetAlreadyFeatured && featuredNow.length >= FEATURED_POST_LIMIT) {
    const overflow = featuredNow.length - FEATURED_POST_LIMIT + 1;
    const idsToRemove = featuredNow.slice(0, overflow).map(item => item._id);
    if (idsToRemove.length) {
      await Post.updateMany(
        { _id: { $in: idsToRemove } },
        { $set: { featuredManual: false, featuredAddedAt: null } }
      );
      removedCount = idsToRemove.length;
    }
  }

  const now = new Date();
  const updated = await Post.findByIdAndUpdate(
    postId,
    { $set: { featuredManual: true, featuredAddedAt: now } },
    { new: true }
  );

  return res.json({
    success: true,
    removedCount,
    post: toListPostPayload(updated)
  });
});

router.delete("/manage/featured/:id", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Only admin can manage featured posts" });
  }

  const postId = String(req.params?.id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return res.status(400).json({ error: "Invalid post id" });
  }

  const updated = await Post.findByIdAndUpdate(
    postId,
    { $set: { featuredManual: false, featuredAddedAt: null } },
    { new: true }
  );

  if (!updated) return res.status(404).json({ error: "Post not found" });
  return res.json({ success: true });
});

router.get("/manage/analytics", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const baseQuery = getAnalyticsBaseQuery(user);

  const posts = await Post.find(baseQuery)
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({
    totals: analytics.totals,
    topPosts: analytics.topPosts,
    topCategories: analytics.topCategories,
    topAuthors: analytics.topAuthors
  });
});

router.get("/manage/analytics/posts", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find(getAnalyticsBaseQuery(user))
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({ totals: analytics.totals, items: analytics.rankedPosts });
});

router.get("/manage/analytics/categories", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find(getAnalyticsBaseQuery(user))
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({ totals: analytics.totals, items: analytics.rankedCategories });
});

router.get("/manage/analytics/authors", auth, requireUploaderOrStaff, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(404).json({ error: "User not found" });

  const posts = await Post.find(getAnalyticsBaseQuery(user))
    .select("title slug author categories createdAt viewCount")
    .sort({ viewCount: -1, createdAt: -1 })
    .lean();

  const analytics = buildAnalyticsPayload(posts);
  return res.json({ totals: analytics.totals, items: analytics.rankedAuthors });
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
