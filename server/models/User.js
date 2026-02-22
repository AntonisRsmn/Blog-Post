const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    username: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    websiteUrl: { type: String, default: "" },
    githubUrl: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    instagramUrl: { type: String, default: "" },
    twitterUrl: { type: String, default: "" },
    tiktokUrl: { type: String, default: "" },
    role: { type: String, default: "commenter" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);