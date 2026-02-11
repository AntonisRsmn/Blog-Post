const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    username: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    role: { type: String, default: "commenter" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);