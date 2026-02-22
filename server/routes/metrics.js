const express = require("express");
const WebVital = require("../models/WebVital");
const SearchMiss = require("../models/SearchMiss");
const AbTestEvent = require("../models/AbTestEvent");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");

const router = express.Router();

function sanitizeString(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeSearchQuery(value) {
  return sanitizeString(value, 140)
    .toLowerCase()
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeVariant(value) {
  const variant = sanitizeString(value, 20).toUpperCase();
  return variant === "A" || variant === "B" ? variant : "";
}

function sanitizeMetric(input, req) {
  const name = sanitizeString(input?.name, 20).toUpperCase();
  const allowedNames = new Set(["CLS", "LCP", "INP", "FCP", "TTFB"]);
  if (!allowedNames.has(name)) return null;

  const value = Number(input?.value);
  if (!Number.isFinite(value) || value < 0 || value > 600000) return null;

  const ratingRaw = sanitizeString(input?.rating, 20).toLowerCase();
  const rating = ["good", "needs-improvement", "poor"].includes(ratingRaw)
    ? ratingRaw
    : "unknown";

  const metricId = sanitizeString(input?.id, 120);
  const path = sanitizeString(input?.path || req.body?.path || req.query?.path || "/", 260) || "/";
  const source = sanitizeString(input?.source, 120);
  const userAgent = sanitizeString(req.get("user-agent"), 300);

  return {
    name,
    value,
    rating,
    metricId,
    path,
    source,
    userAgent
  };
}

function toClampedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function computeP75(values) {
  const numeric = (Array.isArray(values) ? values : [])
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!numeric.length) return 0;
  const index = Math.max(0, Math.ceil(numeric.length * 0.75) - 1);
  return numeric[index];
}

function getThreshold(metricName) {
  const name = String(metricName || "").toUpperCase();
  if (name === "LCP") return { good: 2500, needsImprovement: 4000 };
  if (name === "CLS") return { good: 0.1, needsImprovement: 0.25 };
  if (name === "INP") return { good: 200, needsImprovement: 500 };
  if (name === "FCP") return { good: 1800, needsImprovement: 3000 };
  if (name === "TTFB") return { good: 800, needsImprovement: 1800 };
  return { good: Infinity, needsImprovement: Infinity };
}

function computeHealth(summaryRows) {
  const rows = Array.isArray(summaryRows) ? summaryRows : [];
  if (!rows.length) {
    return {
      status: "unknown",
      message: "No vitals samples yet"
    };
  }

  let hasWatch = false;
  let hasAction = false;

  rows.forEach((row) => {
    const name = String(row?.name || "").toUpperCase();
    const p75 = Number(row?.p75 || 0);
    const threshold = getThreshold(name);
    if (!Number.isFinite(p75)) return;

    if (p75 > threshold.needsImprovement) {
      hasAction = true;
      return;
    }

    if (p75 > threshold.good) {
      hasWatch = true;
    }
  });

  if (hasAction) {
    return { status: "action", message: "At least one metric P75 is in poor range" };
  }

  if (hasWatch) {
    return { status: "watch", message: "Some metric P75 values need improvement" };
  }

  return { status: "good", message: "All tracked metric P75 values are good" };
}

router.post("/web-vitals", async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.metrics) ? req.body.metrics : [req.body];
    const payload = entries
      .map(entry => sanitizeMetric(entry, req))
      .filter(Boolean)
      .slice(0, 10);

    if (!payload.length) {
      return res.status(400).json({ error: "No valid metrics payload" });
    }

    await WebVital.insertMany(payload, { ordered: false });
    return res.json({ success: true, stored: payload.length });
  } catch {
    return res.status(500).json({ error: "Could not store metrics" });
  }
});

router.get("/web-vitals", auth, requireStaff, async (req, res) => {
  try {
    const limit = toClampedNumber(req.query.limit, 50, 1, 200);
    const sinceHours = toClampedNumber(req.query.sinceHours, 24, 1, 24 * 30);
    const name = sanitizeString(req.query.name, 20).toUpperCase();
    const path = sanitizeString(req.query.path, 260);

    const query = {
      createdAt: { $gte: new Date(Date.now() - sinceHours * 60 * 60 * 1000) }
    };

    if (["CLS", "LCP", "INP", "FCP", "TTFB"].includes(name)) {
      query.name = name;
    }

    if (path) {
      query.path = path;
    }

    const [items, total, summaryRows, pathRows] = await Promise.all([
      WebVital.find(query)
        .select("name value rating metricId path source userAgent createdAt")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      WebVital.countDocuments(query),
      WebVital.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$name",
            count: { $sum: 1 },
            avgValue: { $avg: "$value" },
            values: { $push: "$value" },
            good: { $sum: { $cond: [{ $eq: ["$rating", "good"] }, 1, 0] } },
            needsImprovement: { $sum: { $cond: [{ $eq: ["$rating", "needs-improvement"] }, 1, 0] } },
            poor: { $sum: { $cond: [{ $eq: ["$rating", "poor"] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      WebVital.aggregate([
        { $match: query },
        {
          $group: {
            _id: { path: "$path", name: "$name" },
            count: { $sum: 1 },
            avgValue: { $avg: "$value" },
            values: { $push: "$value" }
          }
        },
        { $sort: { count: -1, "_id.path": 1, "_id.name": 1 } },
        { $limit: 30 }
      ])
    ]);

    const summary = summaryRows.map(row => ({
      name: row._id,
      count: Number(row.count || 0),
      avgValue: Number(row.avgValue || 0),
      p75: Number(computeP75(row.values || [])),
      good: Number(row.good || 0),
      needsImprovement: Number(row.needsImprovement || 0),
      poor: Number(row.poor || 0)
    }));

    const pathSummary = pathRows.map(row => ({
      path: String(row?._id?.path || "/"),
      name: String(row?._id?.name || ""),
      count: Number(row.count || 0),
      avgValue: Number(row.avgValue || 0),
      p75: Number(computeP75(row.values || []))
    }));

    const health = computeHealth(summary);

    return res.json({
      filters: { limit, sinceHours, name: name || null, path: path || null },
      total,
      retentionDays: Number(process.env.WEB_VITAL_RETENTION_DAYS || 30),
      health,
      summary,
      pathSummary,
      items
    });
  } catch {
    return res.status(500).json({ error: "Could not load metrics" });
  }
});

router.post("/search-miss", async (req, res) => {
  try {
    const rawQuery = sanitizeString(req.body?.query, 140);
    const normalizedQuery = normalizeSearchQuery(rawQuery);
    const resultCount = Number(req.body?.resultCount);
    const path = sanitizeString(req.body?.path || req.query?.path || "/", 260) || "/";
    const locale = sanitizeString(req.body?.locale, 40);
    const userAgent = sanitizeString(req.get("user-agent"), 300);

    if (!normalizedQuery || normalizedQuery.length < 2) {
      return res.status(202).json({ accepted: false, reason: "query-too-short" });
    }

    if (Number.isFinite(resultCount) && resultCount > 0) {
      return res.status(202).json({ accepted: false, reason: "has-results" });
    }

    await SearchMiss.create({
      query: rawQuery,
      normalizedQuery,
      path,
      resultCount: 0,
      locale,
      userAgent
    });

    return res.status(201).json({ success: true });
  } catch {
    return res.status(500).json({ error: "Could not store search analytics" });
  }
});

router.get("/search-misses", auth, requireStaff, async (req, res) => {
  try {
    const limit = toClampedNumber(req.query.limit, 30, 1, 200);
    const sinceDays = toClampedNumber(req.query.sinceDays, 30, 1, 365);
    const now = Date.now();
    const sinceDate = new Date(now - (sinceDays * 24 * 60 * 60 * 1000));

    const query = { createdAt: { $gte: sinceDate } };

    const [recent, groupedRows, total] = await Promise.all([
      SearchMiss.find(query)
        .select("query normalizedQuery path locale createdAt")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      SearchMiss.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$normalizedQuery",
            count: { $sum: 1 },
            lastSeenAt: { $max: "$createdAt" },
            sampleQuery: { $first: "$query" },
            paths: { $addToSet: "$path" }
          }
        },
        { $sort: { count: -1, lastSeenAt: -1 } },
        { $limit: limit }
      ]),
      SearchMiss.countDocuments(query)
    ]);

    const topMissingQueries = groupedRows.map((row, index) => ({
      rank: index + 1,
      query: String(row?.sampleQuery || row?._id || "").trim(),
      normalizedQuery: String(row?._id || "").trim(),
      misses: Number(row?.count || 0),
      lastSeenAt: row?.lastSeenAt || null,
      paths: Array.isArray(row?.paths) ? row.paths.slice(0, 5) : []
    }));

    return res.json({
      filters: { limit, sinceDays },
      retentionDays: Number(process.env.SEARCH_ANALYTICS_RETENTION_DAYS || 120),
      total,
      topMissingQueries,
      recent: Array.isArray(recent) ? recent : []
    });
  } catch {
    return res.status(500).json({ error: "Could not load search analytics" });
  }
});

router.post("/ab-home-hero", async (req, res) => {
  try {
    const testKey = sanitizeString(req.body?.testKey, 80) || "home-hero-featured-v1";
    const variant = sanitizeVariant(req.body?.variant);
    const eventType = sanitizeString(req.body?.eventType, 20).toLowerCase();
    const path = sanitizeString(req.body?.path || req.query?.path || "/", 260) || "/";
    const targetPostId = sanitizeString(req.body?.targetPostId, 80);
    const targetHref = sanitizeString(req.body?.targetHref, 320);
    const userAgent = sanitizeString(req.get("user-agent"), 300);

    if (!variant) {
      return res.status(400).json({ error: "Invalid variant" });
    }

    if (eventType !== "impression" && eventType !== "click") {
      return res.status(400).json({ error: "Invalid event type" });
    }

    await AbTestEvent.create({
      testKey,
      variant,
      eventType,
      path,
      targetPostId,
      targetHref,
      userAgent
    });

    return res.status(201).json({ success: true });
  } catch {
    return res.status(500).json({ error: "Could not store A/B event" });
  }
});

router.get("/ab-home-hero", auth, requireStaff, async (req, res) => {
  try {
    const testKey = sanitizeString(req.query.testKey, 80) || "home-hero-featured-v1";
    const sinceDays = toClampedNumber(req.query.sinceDays, 30, 1, 365);
    const sinceDate = new Date(Date.now() - (sinceDays * 24 * 60 * 60 * 1000));

    const rows = await AbTestEvent.aggregate([
      { $match: { testKey, createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: { variant: "$variant", eventType: "$eventType" },
          count: { $sum: 1 }
        }
      }
    ]);

    const variants = {
      A: { variant: "A", impressions: 0, clicks: 0, ctr: 0 },
      B: { variant: "B", impressions: 0, clicks: 0, ctr: 0 }
    };

    rows.forEach((row) => {
      const variant = sanitizeVariant(row?._id?.variant);
      const eventType = sanitizeString(row?._id?.eventType, 20).toLowerCase();
      const count = Number(row?.count || 0);
      if (!variant || !variants[variant]) return;
      if (eventType === "impression") variants[variant].impressions += count;
      if (eventType === "click") variants[variant].clicks += count;
    });

    Object.values(variants).forEach((entry) => {
      entry.ctr = entry.impressions > 0
        ? Number(((entry.clicks / entry.impressions) * 100).toFixed(2))
        : 0;
    });

    const winner = variants.A.ctr === variants.B.ctr
      ? "tie"
      : (variants.A.ctr > variants.B.ctr ? "A" : "B");

    return res.json({
      testKey,
      sinceDays,
      retentionDays: Number(process.env.AB_TEST_RETENTION_DAYS || 90),
      variants: [variants.A, variants.B],
      winner
    });
  } catch {
    return res.status(500).json({ error: "Could not load A/B analytics" });
  }
});

module.exports = router;
