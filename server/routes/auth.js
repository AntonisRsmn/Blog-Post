const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

function getStaffEmails() {
  const raw = process.env.STAFF_EMAILS || "";
  return raw
    .split(",")
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

function resolveRole(email) {
  const staffEmails = getStaffEmails();
  return staffEmails.includes(email.toLowerCase()) ? "staff" : "commenter";
}

router.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Validate password strength
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const isLongEnough = password.length >= 8;

  if (!hasLetter || !hasNumber || !hasSymbol || !isLongEnough) {
    return res.status(400).json({ 
      error: "Password must be at least 8 characters and include letters, numbers, and symbols" 
    });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({ error: "This email is already registered. Please log in instead." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = resolveRole(email);
  const user = await User.create({ email, passwordHash, role });

  const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "2h"
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict"
  });

  res.json({ success: true });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const resolvedRole = resolveRole(user.email);
  if (user.role !== resolvedRole) {
    user.role = resolvedRole;
    await user.save();
  }

  const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "2h"
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict"
  });

  res.json({ success: true });
});

router.get("/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.userId).select("email username avatarUrl role");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    _id: user._id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role
  });
});

router.put("/profile", auth, async (req, res) => {
  const { username, avatarUrl } = req.body;
  const updates = {};

  if (typeof username === "string") {
    updates.username = username.trim();
  }

  if (typeof avatarUrl === "string") {
    updates.avatarUrl = avatarUrl.trim();
  }

  const user = await User.findByIdAndUpdate(req.user.userId, updates, {
    new: true
  }).select("email username avatarUrl role");

  res.json({
    _id: user._id,
    email: user.email,
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

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict"
  });
  res.json({ success: true });
});

module.exports = router;
