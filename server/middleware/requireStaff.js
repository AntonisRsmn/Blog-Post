const User = require("../models/User");
const StaffAccess = require("../models/StaffAccess");

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "staff") return "staff";
  if (role === "uploader") return "staff";
  return "";
}

function getEnvStaffEmails() {
  return String(process.env.STAFF_EMAILS || "")
    .split(",")
    .map(email => String(email || "").trim().toLowerCase())
    .filter(Boolean);
}

module.exports = async function requireStaff(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required." });

  const user = await User.findById(userId).select("email role");
  if (!user) {
    return res.status(403).json({ error: "Staff access required." });
  }

  const userEmail = String(user.email || "").trim().toLowerCase();
  const normalizedUserRole = normalizeRole(user.role);
  if (normalizedUserRole) {
    req.userRole = normalizedUserRole;
    return next();
  }

  const envStaffEmails = getEnvStaffEmails();
  if (userEmail && envStaffEmails.includes(userEmail)) {
    req.userRole = "admin";
    return next();
  }

  const staffEntry = userEmail
    ? await StaffAccess.findOne({ email: userEmail }).select("role")
    : null;
  const normalizedStaffRole = normalizeRole(staffEntry?.role);
  if (normalizedStaffRole) {
    req.userRole = normalizedStaffRole;
    return next();
  }

  if (!normalizedUserRole) {
    return res.status(403).json({ error: "Staff access required." });
  }
};