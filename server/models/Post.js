const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, default: "" },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    slug: { type: String, required: true, unique: true },
    excerpt: String,
    content: { type: Array, required: true },
    published: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
