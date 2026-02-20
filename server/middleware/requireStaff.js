const User = require("../models/User");

module.exports = async function requireStaff(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Authentication required." });

  const user = await User.findById(userId).select("role");
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    return res.status(403).json({ error: "Staff access required." });
  }

  req.userRole = user.role;

  next();
};