const User = require("../models/User");

module.exports = async function requireUploaderOrStaff(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).end();

  const user = await User.findById(userId).select("role");
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    return res.status(403).end();
  }

  next();
};
