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
const Post = require("./models/Post");

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const categoryRoutes = require("./routes/categories");
const releaseRoutes = require("./routes/releases");
const uploadRoutes = require("./routes/upload");
const commentRoutes = require("./routes/comments");
const staffRoutes = require("./routes/staff");
const metricsRoutes = require("./routes/metrics");
const newsletterRoutes = require("./routes/newsletter");

const app = express();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function validateStartupConfig() {
  const requiredEnv = ["MONGO_URI", "JWT_SECRET"];
  const missingEnv = requiredEnv.filter(name => !String(process.env[name] || "").trim());
  const issues = [];

  if (missingEnv.length) {
    issues.push(`Missing required environment variables: ${missingEnv.join(", ")}`);
  }

  if (String(process.env.JWT_SECRET || "").length < 32) {
    issues.push("JWT_SECRET must be at least 32 characters long");
  }

  return {
    ok: issues.length === 0,
    issues,
    missingEnv
  };
}

const startupValidation = validateStartupConfig();
if (!startupValidation.ok) {
  console.error("Startup validation failed:");
  startupValidation.issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
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
app.use("/api/metrics", metricsRoutes);
app.use("/api/newsletter", newsletterRoutes);

app.get("/health", (req, res) => {
  const dbReadyState = mongoose.connection.readyState;
  const dbStateLabel = dbReadyState === 1
    ? "connected"
    : dbReadyState === 2
      ? "connecting"
      : dbReadyState === 3
        ? "disconnecting"
        : "disconnected";

  const healthy = startupValidation.ok && dbReadyState === 1;
  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      startupConfig: startupValidation.ok ? "ok" : "failed",
      database: dbStateLabel
    }
  });
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const host = req.get("host");
    const configuredBase = String(process.env.SITE_URL || "").trim();
    const fallbackBase = `${req.protocol}://${host}`;
    const baseUrl = (configuredBase || fallbackBase).replace(/\/$/, "");

    const staticPaths = ["/", "/privacy.html", "/tos.html"];

    const posts = await Post.find({ published: true })
      .select("slug createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    const xmlEscape = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const nowIso = new Date().toISOString();
    const urls = [];

    staticPaths.forEach((pathName) => {
      urls.push({
        loc: `${baseUrl}${pathName}`,
        lastmod: nowIso
      });
    });

    posts.forEach((post) => {
      const slug = String(post?.slug || "").trim();
      if (!slug) return;
      const lastmodSource = post?.updatedAt || post?.createdAt || new Date();
      urls.push({
        loc: `${baseUrl}/post.html?slug=${encodeURIComponent(slug)}`,
        lastmod: new Date(lastmodSource).toISOString()
      });
    });

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((entry) => [
        "  <url>",
        `    <loc>${xmlEscape(entry.loc)}</loc>`,
        `    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`,
        "  </url>"
      ].join("\n")),
      "</urlset>"
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=UTF-8");
    return res.status(200).send(body);
  } catch (error) {
    console.error("Sitemap generation failed", error);
    return res.status(500).type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><error>unavailable</error>');
  }
});

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

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.status(404).sendFile(path.join(frontendPath, "404.html"));
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
  .catch((error) => {
    console.error("MongoDB connection failed during startup", error);
  });

mongoose.connection.on("error", (error) => {
  console.error("MongoDB runtime error", error);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

// Server
const BASE_PORT = parsePositiveInt(process.env.PORT, 8080);
const PORT_FALLBACK_TRIES = parsePositiveInt(process.env.PORT_FALLBACK_TRIES, 0);

function listenWithFallback(startPort, retriesLeft) {
  const server = app.listen(startPort, () => {
    if (startPort === BASE_PORT) {
      console.log("Server running on port", startPort);
    } else {
      console.log(`Server running on fallback port ${startPort} (requested ${BASE_PORT})`);
    }
  });

  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE" && retriesLeft > 0) {
      console.warn(`Port ${startPort} is busy. Trying port ${startPort + 1}...`);
      listenWithFallback(startPort + 1, retriesLeft - 1);
      return;
    }

    if (error?.code === "EADDRINUSE") {
        console.warn(`Port ${startPort} is busy and no configured fallback ports remain. Trying an OS-assigned free port...`);
        const ephemeralServer = app.listen(0, () => {
          const address = ephemeralServer.address();
          const resolvedPort = typeof address === "object" && address ? address.port : "unknown";
          console.log(`Server running on OS-assigned port ${resolvedPort} (requested ${BASE_PORT})`);
        });

        ephemeralServer.on("error", (ephemeralError) => {
          console.error("Server failed to start on OS-assigned port", ephemeralError);
          process.exit(1);
        });
    }

    console.error("Server failed to start", error);
    process.exit(1);
  });
}

listenWithFallback(BASE_PORT, PORT_FALLBACK_TRIES);
