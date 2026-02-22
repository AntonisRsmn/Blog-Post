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
      DEFAULT_CATEGORIES.map(name => ({ name, createdBy: null })),
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

router.get("/manage", auth, requireStaff, async (req, res) => {
  await ensureDefaultCategories();

  const [storedCategories, posts] = await Promise.all([
    Category.find().select("name createdBy").lean(),
    Post.find().select("categories -_id").lean()
  ]);

  const currentUserId = String(req.user?.userId || "");
  const categoryMeta = new Map();

  storedCategories.forEach(category => {
    const normalizedName = normalizeCategoryName(category?.name);
    if (!normalizedName) return;
    const ownerId = category?.createdBy ? String(category.createdBy) : "";
    const canDelete = req.userRole === "admin" || (ownerId && ownerId === currentUserId);
    categoryMeta.set(normalizedName, {
      name: normalizedName,
      canDelete,
      createdByMe: Boolean(ownerId && ownerId === currentUserId)
    });
  });

  posts.forEach(post => {
    if (!Array.isArray(post.categories)) return;
    post.categories.forEach(category => {
      const normalizedName = normalizeCategoryName(category);
      if (!normalizedName || categoryMeta.has(normalizedName)) return;
      categoryMeta.set(normalizedName, {
        name: normalizedName,
        canDelete: req.userRole === "admin",
        createdByMe: false
      });
    });
  });

  const categories = [...categoryMeta.values()].sort((a, b) => a.name.localeCompare(b.name));
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
      {
        $set: { name },
        $setOnInsert: { createdBy: req.user?.userId || null }
      },
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

    const targetCategory = await Category.findOne({ name: nameRegex }).select("_id createdBy").lean();
    if (req.userRole !== "admin") {
      const currentUserId = String(req.user?.userId || "");
      const ownerId = targetCategory?.createdBy ? String(targetCategory.createdBy) : "";
      const canDelete = Boolean(targetCategory && ownerId && ownerId === currentUserId);
      if (!canDelete) {
        return res.status(403).json({ error: "You can only delete categories created by your account." });
      }
    }

    const deleteFilter = req.userRole === "admin"
      ? { name: nameRegex }
      : { name: nameRegex, createdBy: req.user?.userId || null };

    const deleteResult = await Category.deleteMany(deleteFilter);
    if (!deleteResult.deletedCount) {
      return res.status(404).json({ error: "Category not found." });
    }

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
