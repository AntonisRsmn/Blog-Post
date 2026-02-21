require("dotenv").config({ quiet: true });
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const path = require("path");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const User = require("./models/User");

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const categoryRoutes = require("./routes/categories");
const releaseRoutes = require("./routes/releases");
const uploadRoutes = require("./routes/upload");
const commentRoutes = require("./routes/comments");
const staffRoutes = require("./routes/staff");

const app = express();

const requiredEnv = ["MONGO_URI", "JWT_SECRET"];
const missingEnv = requiredEnv.filter(name => !process.env[name]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

if (String(process.env.JWT_SECRET || "").length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(compression({ threshold: 1024 }));

function sanitizeMongoOperatorsInPlace(value) {
  if (Array.isArray(value)) {
    value.forEach(item => sanitizeMongoOperatorsInPlace(item));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.keys(value).forEach(key => {
    const child = value[key];
    if (key.startsWith("$") || key.includes(".")) {
      delete value[key];
      return;
    }

    sanitizeMongoOperatorsInPlace(child);
  });
}

app.use((req, res, next) => {
  sanitizeMongoOperatorsInPlace(req.body);
  sanitizeMongoOperatorsInPlace(req.params);
  sanitizeMongoOperatorsInPlace(req.query);
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again later." }
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/password", authLimiter);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/releases", releaseRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/staff", staffRoutes);

// Serve frontend
const frontendPath = path.join(__dirname, "..", "frontend");
app.use("/admin", async (req, res, next) => {
  const publicAdminPages = new Set(["/login.html", "/signup.html"]);
  const staffOnlyAdminPages = new Set([]);
  if (publicAdminPages.has(req.path)) {
    return next();
  }

  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/no-access.html");
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(payload.userId).select("role");
    if (!user) {
      return res.redirect("/no-access.html");
    }

    if (user.role === "admin") {
      return next();
    }

    if (user.role === "staff") {
      if (staffOnlyAdminPages.has(req.path)) {
        return res.redirect("/no-access.html");
      }
      return next();
    }

    if (req.path !== "/profile.html") {
      return res.redirect("/no-access.html");
    }
  } catch {
    return res.redirect("/no-access.html");
  }

  return next();
});

app.use(express.static(frontendPath, {
  etag: true,
  lastModified: true,
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (/\.html?$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache");
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  }
}));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.use((err, req, res, next) => {
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: "Invalid upload payload" });
  }

  if (err?.message === "Invalid image type") {
    return res.status(400).json({ error: "Only jpeg, png, webp, and gif images are allowed" });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
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
