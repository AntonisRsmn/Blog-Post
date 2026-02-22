const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true },
    authorAvatar: { type: String, default: "" },
    text: { type: String, required: true },
    reactions: {
      like: { type: Number, default: 0 },
      helpful: { type: Number, default: 0 },
      funny: { type: Number, default: 0 }
    },
    reactionUsers: { type: Map, of: String, default: {} },
    spamScore: { type: Number, default: 0 },
    spamFlags: { type: [String], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Comment", CommentSchema);