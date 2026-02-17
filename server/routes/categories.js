const express = require("express");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const Category = require("../models/Category");
const Post = require("../models/Post");

const router = express.Router();

const DEFAULT_CATEGORIES = ["Tech", "Gaming", "AI", "News", "Car"];

function normalizeCategoryName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
    Category.find().select("name -_id"),
    Post.find().select("categories -_id")
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
});

router.delete("/:name", auth, requireStaff, async (req, res) => {
  const name = normalizeCategoryName(decodeURIComponent(req.params.name));
  if (!name) {
    return res.status(400).json({ error: "Category name is required." });
  }

  await Promise.all([
    Category.deleteOne({ name }),
    Post.updateMany({}, { $pull: { categories: name } })
  ]);

  res.json({ name });
});

module.exports = router;
