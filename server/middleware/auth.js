const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!payload?.userId) return res.status(401).json({ error: "Invalid session." });

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please log in again." });
  }
};
