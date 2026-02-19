const mongoose = require("mongoose");

const StaffAccessSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "staff"], default: "admin" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StaffAccess", StaffAccessSchema);
