require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const categoryRoutes = require("./routes/categories");
const releaseRoutes = require("./routes/releases");
const uploadRoutes = require("./routes/upload");
const commentRoutes = require("./routes/comments");
const auth = require("./middleware/auth");
const requireStaff = require("./middleware/requireStaff");

const app = express();

app.use(express.json());
app.use(cookieParser());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/releases", releaseRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/comments", commentRoutes);

// Serve frontend
const frontendPath = path.join(__dirname, "..", "frontend");

app.get("/admin/dashboard.html", async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/no-access.html");
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select("role");
    if (!user || user.role !== "staff") {
      return res.redirect("/no-access.html");
    }
  } catch {
    return res.redirect("/no-access.html");
  }

  res.sendFile(path.join(frontendPath, "admin", "dashboard.html"));
});

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(console.error);

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
