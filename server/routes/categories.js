const express = require("express");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const Category = require("../models/Category");
const Post = require("../models/Post");

const router = express.Router();

const DEFAULT_CATEGORIES = ["TECH", "GAMING", "AI", "NEWS", "CAR"];

function normalizeCategoryName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureDefaultCategories() {
  const existingCount = await Category.estimatedDocumentCount();
  if (existingCount > 0) return;

  try {
    await Category.insertMany(
      DEFAULT_CATEGORIES.map(name => ({ name })),
      { ordered: false }
    );
  } catch {
  }
}

router.get("/", async (req, res) => {
  await ensureDefaultCategories();

  const [storedCategories, posts] = await Promise.all([
    Category.find().select("name -_id").lean(),
    Post.find().select("categories -_id").lean()
  ]);

  const names = new Set();

  storedCategories.forEach(category => {
    const name = normalizeCategoryName(category.name);
    if (name) names.add(name);
  });

  posts.forEach(post => {
    if (!Array.isArray(post.categories)) return;
    post.categories.forEach(category => {
      const name = normalizeCategoryName(category);
      if (name) names.add(name);
    });
  });

  const categories = [...names].sort((a, b) => a.localeCompare(b));
  res.json(categories);
});

router.post("/", auth, requireStaff, async (req, res) => {
  try {
    const name = normalizeCategoryName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    await Category.findOneAndUpdate(
      { name },
      { name },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ name });
  } catch {
    res.status(500).json({ error: "Could not create category." });
  }
});

router.put("/:name", auth, requireStaff, async (req, res) => {
  return res.status(405).json({ error: "Editing categories is disabled." });
});

router.delete("/:name", auth, requireStaff, async (req, res) => {
  try {
    const name = normalizeCategoryName(decodeURIComponent(req.params.name));
    if (!name) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const nameRegex = new RegExp(`^${escapeRegex(name)}$`, "i");

    await Category.deleteMany({ name: nameRegex });

    const posts = await Post.find({ categories: { $exists: true, $ne: [] } })
      .select("_id categories")
      .lean();

    const updates = posts
      .map(post => {
        const categories = Array.isArray(post.categories) ? post.categories : [];
        const filtered = categories.filter(category => normalizeCategoryName(category) !== name);

        if (filtered.length === categories.length) {
          return null;
        }

        return {
          updateOne: {
            filter: { _id: post._id },
            update: { $set: { categories: filtered } }
          }
        };
      })
      .filter(Boolean);

    if (updates.length) {
      await Post.bulkWrite(updates, { ordered: false });
    }

    res.json({ name });
  } catch {
    res.status(500).json({ error: "Could not delete category." });
  }
});

module.exports = router;
