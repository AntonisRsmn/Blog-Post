const mongoose = require("mongoose");

const NewsletterSubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180, unique: true },
    source: { type: String, default: "site-footer", maxlength: 80 },
    sourcePath: { type: String, default: "", maxlength: 200 },
    postId: { type: String, default: "", maxlength: 80 },
    postSlug: { type: String, default: "", maxlength: 180 },
    postTitle: { type: String, default: "", maxlength: 220 },
    locale: { type: String, default: "", maxlength: 40 },
    userAgent: { type: String, default: "", maxlength: 300 }
  },
  { timestamps: true }
);

NewsletterSubscriberSchema.index({ createdAt: -1 });

module.exports = mongoose.model("NewsletterSubscriber", NewsletterSubscriberSchema);
