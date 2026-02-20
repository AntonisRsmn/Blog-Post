const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const StaffAccess = require("../models/StaffAccess");
const auth = require("../middleware/auth");

const router = express.Router();
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function getStaffEmails() {
  const raw = process.env.STAFF_EMAILS || "";
  return raw
    .split(",")
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizePlainText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
  const value = String(password || "");
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value);
  const isLongEnough = value.length >= 8;
  return hasLetter && hasNumber && hasSymbol && isLongEnough;
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TOKEN_TTL_MS,
    path: "/"
  };
}

async function resolveRole(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return "commenter";

  const staffEmails = getStaffEmails();
  if (staffEmails.includes(normalizedEmail)) return "admin";

  const staffEntry = await StaffAccess.findOne({ email: normalizedEmail }).select("role");
  if (!staffEntry) return "commenter";

  if (staffEntry.role === "admin") return "admin";
  if (staffEntry.role === "staff") return "staff";
  if (staffEntry.role === "uploader") return "staff";
  return "commenter";
}

router.post("/signup", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: "First name, last name, email, and password are required" });
  }

  const normalizedFirstName = sanitizePlainText(firstName, 60);
  const normalizedLastName = sanitizePlainText(lastName, 60);
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (!normalizedFirstName || !normalizedLastName) {
    return res.status(400).json({ error: "First name and last name are required" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ 
      error: "Password must be at least 8 characters and include letters, numbers, and symbols" 
    });
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: "This email is already registered. Please log in instead." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = await resolveRole(normalizedEmail);
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    role,
    firstName: normalizedFirstName,
    lastName: normalizedLastName
  });

  const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "2h"
  });

  res.cookie("token", token, getCookieOptions());

  res.json({ success: true });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const resolvedRole = await resolveRole(user.email);
  if (user.role !== resolvedRole) {
    user.role = resolvedRole;
    await user.save();
  }

  const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "2h"
  });

  res.cookie("token", token, getCookieOptions());

  res.json({ success: true });
});

router.get("/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.userId).select("email firstName lastName username avatarUrl role");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role
  });
});

router.put("/profile", auth, async (req, res) => {
  const { firstName, lastName, username, avatarUrl } = req.body;
  const updates = {};

  if (typeof firstName === "string") {
    updates.firstName = sanitizePlainText(firstName, 60);
  }

  if (typeof lastName === "string") {
    updates.lastName = sanitizePlainText(lastName, 60);
  }

  if (typeof username === "string") {
    updates.username = sanitizePlainText(username, 40);
  }

  if (typeof avatarUrl === "string") {
    const normalizedAvatar = String(avatarUrl || "").trim();
    if (!normalizedAvatar) {
      updates.avatarUrl = "";
    } else {
      try {
        const parsed = new URL(normalizedAvatar);
        const isHttp = parsed.protocol === "https:" || parsed.protocol === "http:";
        if (!isHttp) return res.status(400).json({ error: "Invalid avatar URL" });
        updates.avatarUrl = normalizedAvatar;
      } catch {
        return res.status(400).json({ error: "Invalid avatar URL" });
      }
    }
  }

  const user = await User.findByIdAndUpdate(req.user.userId, updates, {
    new: true
  }).select("email firstName lastName username avatarUrl role");

  res.json({
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role
  });
});

router.put("/password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }

  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Current password is incorrect" });

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and include letters, numbers, and symbols" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    ...getCookieOptions(),
    maxAge: undefined,
    expires: new Date(0)
  });
  res.json({ success: true });
});

module.exports = router;
