const express = require("express");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const auth = require("../middleware/auth");
const requireUploaderOrStaff = require("../middleware/requireUploaderOrStaff");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error("Invalid image type"));
    }
    cb(null, true);
  }
});

const router = express.Router();

router.post("/", auth, requireUploaderOrStaff, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Image file is required" });
  }

  const stream = cloudinary.uploader.upload_stream(
    { folder: "blog" },
    (err, result) => {
      if (err) return res.status(500).json({ error: "Upload failed" });
      res.json({ url: result.secure_url });
    }
  );

  stream.end(req.file.buffer);
});

module.exports = router;
