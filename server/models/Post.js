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
    slug: { type: String, required: true, unique: true },
    excerpt: String,
    content: { type: Array, required: true },
    published: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
