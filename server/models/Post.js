const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, default: "" },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    categories: { type: [String], default: [] },
    releaseDate: { type: Date, default: null },
    releaseType: {
      type: String,
      enum: ["Game", "Tech", ""],
      default: ""
    },
    includeInCalendar: { type: Boolean, default: false },
    featuredManual: { type: Boolean, default: false },
    featuredAddedAt: { type: Date, default: null },
    thumbnailUrl: { type: String, default: "" },
    slug: { type: String, required: true, unique: true },
    excerpt: String,
    content: { type: Array, required: true },
    published: { type: Boolean, default: true }
  },
  { timestamps: true }
);

PostSchema.index({ published: 1, createdAt: -1 });
PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ includeInCalendar: 1, releaseDate: -1 });
PostSchema.index({ featuredManual: 1, featuredAddedAt: -1 });

module.exports = mongoose.model("Post", PostSchema);
