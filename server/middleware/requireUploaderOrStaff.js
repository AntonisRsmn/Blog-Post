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

module.exports = async function requireUploaderOrStaff(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).end();

  const user = await User.findById(userId).select("email role");
  if (!user) return res.status(403).end();

  const roleFromUser = normalizeRole(user.role);
  if (roleFromUser) {
    req.userRole = roleFromUser;
    return next();
  }

  const userEmail = String(user.email || "").trim().toLowerCase();
  if (userEmail && getEnvStaffEmails().includes(userEmail)) {
    req.userRole = "admin";
    return next();
  }

  const staffEntry = userEmail
    ? await StaffAccess.findOne({ email: userEmail }).select("role")
    : null;
  const roleFromStaffAccess = normalizeRole(staffEntry?.role);
  if (roleFromStaffAccess) {
    req.userRole = roleFromStaffAccess;
    return next();
  }

  return res.status(403).end();

};
