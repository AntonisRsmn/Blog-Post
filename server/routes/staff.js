const express = require("express");
const auth = require("../middleware/auth");
const requireStaff = require("../middleware/requireStaff");
const StaffAccess = require("../models/StaffAccess");
const User = require("../models/User");

const router = express.Router();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeAccessRole(value) {
  if (value === "admin") return "admin";
  if (value === "staff") return "staff";
  if (value === "uploader") return "staff";
  return "admin";
}

function getEnvStaffEmails() {
  const raw = process.env.STAFF_EMAILS || "";
  return raw
    .split(",")
    .map(entry => normalizeEmail(entry))
    .filter(Boolean);
}

router.get("/", auth, requireStaff, async (req, res) => {
  const dbEntries = await StaffAccess.find().select("email role updatedAt").sort({ email: 1 });
  const envEmails = getEnvStaffEmails();

  const emailMap = new Map();

  dbEntries.forEach(entry => {
    emailMap.set(entry.email, {
      email: entry.email,
      source: "database",
      role: normalizeAccessRole(entry.role),
      updatedAt: entry.updatedAt
    });
  });

  envEmails.forEach(email => {
    if (emailMap.has(email)) {
      const current = emailMap.get(email);
      emailMap.set(email, {
        ...current,
        source: "env+database",
        role: "admin"
      });
    } else {
      emailMap.set(email, {
        email,
        source: "env",
        role: "admin",
        updatedAt: null
      });
    }
  });

  const emails = [...emailMap.keys()];
  const users = emails.length
    ? await User.find({ email: { $in: emails } }).select("email username firstName lastName")
    : [];

  const userByEmail = new Map();
  users.forEach(user => {
    userByEmail.set(user.email, {
      username: user.username || "",
      firstName: user.firstName || "",
      lastName: user.lastName || ""
    });
  });

  const entries = [...emailMap.values()]
    .sort((a, b) => a.email.localeCompare(b.email))
    .map(entry => {
      const linkedUser = userByEmail.get(entry.email) || {
        username: "",
        firstName: "",
        lastName: ""
      };

      const role = entry.source === "env" || entry.source === "env+database"
        ? "admin"
        : normalizeAccessRole(entry.role);

      return {
        ...entry,
        role,
        user: linkedUser
      };
    });

  res.json({
    entries
  });
});

router.post("/", auth, requireStaff, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const role = req.body?.role === "staff" ? "staff" : "admin";
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  await StaffAccess.findOneAndUpdate(
    { email },
    { email, role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.updateMany({ email }, { $set: { role } });

  res.json({ success: true, email, role });
});

router.delete("/:email", auth, requireStaff, async (req, res) => {
  const email = normalizeEmail(decodeURIComponent(req.params.email));
  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  const envStaffEmails = getEnvStaffEmails();
  if (envStaffEmails.includes(email)) {
    return res.status(400).json({ error: "This email is managed by STAFF_EMAILS and cannot be removed here." });
  }

  await StaffAccess.deleteOne({ email });
  await User.updateMany({ email }, { $set: { role: "commenter" } });

  res.json({ success: true, email });
});

module.exports = router;
